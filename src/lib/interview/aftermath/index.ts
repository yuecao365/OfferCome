import "server-only";

import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { competenciesOf } from "@/lib/mock-interviews/context";
import { scheduleMockInterviewQuestionEvaluation } from "@/lib/mock-interviews/question-evaluation-background";
import { evaluatePersistedMockInterviewQuestion } from "@/lib/mock-interviews/question-evaluation-service";

import { parseEventRow, transcriptOf, type InterviewEvent } from "../events";
import { cutSegments, type Segment } from "./cut";
import { segmentRecord } from "./segments";

/**
 * 事后流水线的第一步（本地版）：面试结束后把逐字稿按材料切段（纯代码，§11.2），写线程投影与兼容题目，安排逐题评分；
 * 段的判断（verdict / difficulty / competencyId）由评分写回。幂等：已有分段的会话直接返回；重切先删旧的（开发工具用）。
 */

async function loadForSegmenting(sessionId: string) {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: { events: { orderBy: { seq: "asc" } }, threads: { select: { id: true } }, interview: { select: { id: true } } },
  });
  if (!session) throw new Error("模拟面试不存在。");
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) throw new Error("这场面试还没有准备好。");
  const events = session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  return { session, brief, transcript: transcriptOf(events) };
}

/** 切一次并落库：返回段数与待评分的题目 id。 */
async function segmentAndPersist(sessionId: string): Promise<{ count: number; questionIds: string[] }> {
  const { session, brief, transcript } = await loadForSegmenting(sessionId);
  if (transcript.length === 0) return { count: 0, questionIds: [] };
  const segments = cutSegments(transcript, brief);
  const questionIds = await persistSegments(sessionId, session.interview.id, brief, transcript, segments, new Set(competenciesOf(session.contextSnapshotJson).map((item) => item.id)));
  return { count: segments.length, questionIds };
}

/** 有分段就不动；没有就切一次并落库，评分在响应返回后跑。返回段数。 */
export async function ensureSegments(sessionId: string): Promise<number> {
  const { session } = await loadForSegmenting(sessionId);
  if (session.threads.length > 0) return session.threads.length;
  const { count, questionIds } = await segmentAndPersist(sessionId);
  for (const id of questionIds) scheduleMockInterviewQuestionEvaluation(id);
  return count;
}

/** 重切（`npm run resegment`，请求作用域之外）：删掉旧的分段、兼容题目与评分，按当前代码再切一次，评分同步跑完。 */
export async function resegment(sessionId: string): Promise<number> {
  const threads = await prisma.interviewThread.findMany({ where: { sessionId }, select: { questionId: true } });
  await prisma.$transaction([
    prisma.interviewThread.deleteMany({ where: { sessionId } }),
    prisma.interviewQuestion.deleteMany({ where: { id: { in: threads.flatMap((thread) => (thread.questionId ? [thread.questionId] : [])) } } }),
    prisma.mockInterviewSession.update({ where: { id: sessionId }, data: { questionCount: 0, hypothesesJson: null } }),
  ]);
  const { count, questionIds } = await segmentAndPersist(sessionId);
  for (const id of questionIds) await evaluatePersistedMockInterviewQuestion(id);
  return count;
}

async function persistSegments(sessionId: string, interviewId: string, brief: Awaited<ReturnType<typeof loadForSegmenting>>["brief"], transcript: ReturnType<typeof transcriptOf>, segments: Segment[], competencyIds: Set<string>): Promise<string[]> {
  const areas = new Map(brief.areas.map((area) => [area.id, area]));
  const toEvaluate: string[] = [];
  await prisma.$transaction(
    async (tx) => {
      for (const [index, segment] of segments.entries()) {
        const area = areas.get(segment.areaId)!;
        const probes = transcript.filter((line) => line.role === "interviewer" && line.kind === "say" && line.seq > segment.startSeq && line.seq <= segment.endSeq).map((line) => line.content);
        const record = segmentRecord(area, segment, probes);
        const question = await tx.interviewQuestion.create({
          data: {
            interviewId,
            question: record.question,
            answer: record.answer,
            skippedAt: record.skipped ? new Date() : null,
            category: record.category,
            sortOrder: index,
            evaluation: {
              create: {
                sourceKind: record.sourceKind,
                rubricJson: JSON.stringify(record.rubric),
                expectedSignalsJson: JSON.stringify(record.expectedSignals),
                generationMetadataJson: JSON.stringify(record.metadata),
              },
            },
          },
          select: { id: true },
        });
        await tx.interviewThread.create({
          data: {
            sessionId,
            areaId: segment.areaId,
            kind: segment.kind,
            label: segment.label,
            entryQuestion: segment.entryQuestion,
            status: "closed",
            depth: segment.depth,
            verdict: record.metadata.verdict,
            startSeq: segment.startSeq,
            endSeq: segment.endSeq,
            // 场景题绑定了蓝图能力；项目与基础题的能力由评分写回。
            competencyId: area.competencyIds.find((id) => competencyIds.has(id)) ?? null,
            difficulty: null,
            questionId: question.id,
          },
        });
        if (!record.skipped) toEvaluate.push(question.id);
      }
      await tx.mockInterviewSession.update({ where: { id: sessionId }, data: { questionCount: segments.length, hypothesesJson: null } });
    },
    { maxWait: 20_000, timeout: 60_000 },
  );
  return toEvaluate;
}

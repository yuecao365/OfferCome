import process from "node:process";

import { prisma } from "../src/lib/db";
import { parseEventRow, transcriptOf, type InterviewEvent } from "../src/lib/interview/events";
import { JUDGE_PROMPT_VERSION, judgeSegment } from "../src/lib/interview/judge";
import { parseStoredBrief } from "../src/lib/mock-interviews/brief/brief";
import { competenciesOf } from "../src/lib/mock-interviews/context";
import { getAiTaskConfig } from "../src/lib/settings/ai";

/**
 * 用当前版本的在线评委重评已结束场次里评过的段（不写库）：改了评委之后对旧场次做对照，看层次与分数怎么变。
 *   npm run rejudge -- <sessionId> [<sessionId> ...]
 * 每段一次小模型调用（约 2k 输入 token）。
 */
async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error("用法：npm run rejudge -- <sessionId> [...]");
  const config = await getAiTaskConfig("text");
  const rows: string[] = [];
  for (const sessionId of ids) {
    const session = await prisma.mockInterviewSession.findUniqueOrThrow({ where: { id: sessionId }, include: { events: { orderBy: { seq: "asc" } }, interview: { select: { companyName: true } } } });
    const brief = parseStoredBrief(session.briefJson);
    if (!brief) throw new Error(`${sessionId} 没有简报`);
    const events = session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
    const transcript = transcriptOf(events);
    const competencies = competenciesOf(session.contextSnapshotJson);
    for (const item of events) {
      if (item.type !== "segment_scored") continue;
      const before = item.payload;
      const scored = await judgeSegment({ runId: `rejudge:${sessionId}:${before.startSeq}`, config, brief, competencies, transcript, segment: { startSeq: before.startSeq, endSeq: before.endSeq, materialId: null } });
      const after = scored?.payload ?? null;
      rows.push(`| ${session.interview.companyName} | ${before.startSeq}–${before.endSeq} | ${before.competencyId} 第 ${before.difficulty} 层 ${Math.round(before.score)} 分（${before.confidence}） | ${after ? `${after.competencyId} 第 ${after.difficulty} 层 ${Math.round(after.score)} 分（${after.confidence}）` : "—"} |`);
    }
  }
  console.log(`| 场次 | 段 | 原评分 | ${JUDGE_PROMPT_VERSION} |\n|---|---|---|---|\n${rows.join("\n")}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

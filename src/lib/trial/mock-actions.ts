"use client";

import type { RecentWeakness } from "@/lib/mock-interviews/context";
import { cutSegments } from "@/lib/interview/aftermath/cut";
import { segmentRecord } from "@/lib/interview/aftermath/segments";
import { isInterviewPace, type InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { renderLedger } from "@/lib/interview/state";
import type { TurnPayload } from "@/lib/interview/views";

import {
  listTrialInterviews,
  mutateTrialInterview,
  readTrialInterview,
  removeTrialInterview,
  writeTrialInterview,
} from "./browser-store";
import {
  createTrialTurnTransport,
  evaluateSegment,
  isMissingAiConfig,
  parseJobDescriptionFile,
  requestBlueprint,
  requestBrief,
  requestReport } from "./client";
import {
  applyTurnPayload,
  completeTrialInterview,
  createTrialInterview,
  retryGeneration,
  segmentsToEvaluate,
  setSegmentEvaluation,
  withBlueprint,
  withBrief,
  withGenerationError,
  withStatus,
  type TrialInterview,
  type TrialResumeInput,
} from "./interview";
import { addCompletedMockInterview, deleteInterview } from "./workspace-interviews";
import { currentWorkspace, mutateWorkspace } from "./workspace-store";

/**
 * 网页版模拟面试的浏览器编排：与本地版 generation.ts（备课）、session.ts（回合落库）、
 * question-evaluation-background.ts（逐段评分）、completion.ts（交卷）承担相同职责，
 * 差别只在状态写进浏览器存储而不是数据库、后台任务跑在页面里而不是 after()。
 */

function rethrow(caught: unknown, fallback: string): never {
  if (isMissingAiConfig(caught)) {
    throw new Error("模型连接已失效，请到设置页重新连接后继续。");
  }
  throw caught instanceof Error ? caught : new Error(fallback);
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function requireInterview(id: string): TrialInterview {
  const interview = readTrialInterview(id);
  if (!interview) throw new Error("没有找到这场模拟面试，请重新开始一场。");
  return interview;
}

/* ------------------------------ 创建与备课 ------------------------------ */

const RECENT_WEAKNESS_LIMIT = 6;
const RECENT_WEAKNESS_INTERVIEWS = 5;

const RECENT_QUESTION_LIMIT = 12;

/**
 * 最近几场模拟面试给备课的历史，与本地版 context.ts 同口径：最近 5 场、同岗位排前；
 * 失守的考点最多 6 条（"针对练习"指定的题的短板放最前）；同岗位的切入问题。
 */
function recentHistory(jobTitle: string, seedQuestionId: string | null): { recentWeaknesses: RecentWeakness[]; recentQuestions: string[] } {
  const wanted = jobTitle.trim().toLocaleLowerCase();
  const sameJob = (title: string) => title.trim().toLocaleLowerCase() === wanted;
  const records = currentWorkspace()
    .interviews.filter((interview) => interview.kind === "mock" && interview.status === "completed")
    .toSorted((left, right) => Number(sameJob(right.jobTitle)) - Number(sameJob(left.jobTitle)))
    .slice(0, RECENT_WEAKNESS_INTERVIEWS);
  const questions = records.flatMap((record) => record.questions);
  const seed = seedQuestionId ? questions.find((question) => question.id === seedQuestionId) : null;
  const ordered = seed ? [seed, ...questions.filter((question) => question !== seed)] : questions;
  const recentWeaknesses = ordered
    .flatMap((question): RecentWeakness[] => {
      const weaknesses = question.evaluation?.weaknesses ?? [];
      const area = question.question.slice(0, 80);
      if (weaknesses.length > 0) return weaknesses.map((weakness) => ({ area, point: weakness.point, kind: weakness.kind, quote: weakness.quote }));
      return question === seed ? [{ area, point: "候选人要求重练这道题。", kind: "practice", quote: null }] : [];
    })
    .slice(0, RECENT_WEAKNESS_LIMIT);
  // 切入问题从会话文档的切段元数据取（工作台记录里没有），只看同岗位；与本地版 context.ts 同口径。
  const completed = listTrialInterviews().filter((interview) => interview.status === "completed");
  const sameJobSegments = completed.filter((interview) => sameJob(interview.job.jobTitle)).flatMap((interview) => interview.questions);
  return {
    recentWeaknesses,
    recentQuestions: sameJobSegments.map((segment) => segment.question.split("\n")[0].trim()).filter(Boolean).slice(0, RECENT_QUESTION_LIMIT),
  };
}

/** 与本地版 POST /api/interviews/mock 同责：读表单、建会话、给出房间地址；备课由房间页驱动。 */
export async function createTrialMockSession(formData: FormData, resume: TrialResumeInput): Promise<{ href: string }> {
  const companyName = field(formData, "companyName");
  const jobTitle = field(formData, "jobTitle");
  if (!companyName || !jobTitle) throw new Error("请填写公司名称和岗位名称。");
  const file = formData.get("jobDescriptionFile");
  const jobDescription = file instanceof File && file.name ? await parseJobDescriptionFile(file) : field(formData, "jobDescriptionText");
  if (!jobDescription) throw new Error("请上传或粘贴岗位描述。");
  const pace = field(formData, "pace");
  const interview = createTrialInterview({
    job: { companyName, jobTitle, jobDescription },
    resume,
    round: field(formData, "round") || null,
    pace: isInterviewPace(pace) ? pace : "standard",
  });
  writeTrialInterview(interview);
  void runGeneration(interview.id, field(formData, "seedQuestionId") || null);
  return { href: `/interviews/mock/${interview.id}` };
}

const generating = new Set<string>();

/** 备课：蓝图 → 简报，每步完成写文档；失败停在 generation_failed，重试只重跑失败的那一步。 */
export async function runGeneration(id: string, seedQuestionId: string | null = null): Promise<void> {
  if (generating.has(id)) return;
  generating.add(id);
  try {
    let interview = requireInterview(id);
    if (interview.status !== "generating") return;
    if (!interview.blueprint) {
      const blueprint = await requestBlueprint({ jobTitle: interview.job.jobTitle, jobDescription: interview.job.jobDescription });
      interview = mutateTrialInterview(id, (current) => withBlueprint(current, blueprint)) ?? interview;
    }
    const { brief } = await requestBrief({
      job: interview.job,
      resume: interview.resume,
      blueprint: interview.blueprint!,
      pace: interview.pace,
      round: interview.round,
      ...recentHistory(interview.job.jobTitle, seedQuestionId),
    });
    mutateTrialInterview(id, (current) => withBrief(current, brief));
  } catch (caught) {
    const message = isMissingAiConfig(caught)
      ? "模型连接已失效，请到设置页重新连接后重试。"
      : caught instanceof Error
        ? caught.message
        : "面试准备没有完成。";
    mutateTrialInterview(id, (current) => withGenerationError(current, message));
  } finally {
    generating.delete(id);
  }
}

export function retryTrialGeneration(id: string): Promise<void> {
  mutateTrialInterview(id, retryGeneration);
  return runGeneration(id);
}

/* ------------------------------ 回合 ------------------------------ */

export function createTrialChatTransport(id: string) {
  const interview = requireInterview(id);
  return createTrialTurnTransport({
    readState: () => {
      const current = requireInterview(id);
      if (!current.brief) throw new Error("这场面试还没有准备好。");
      return { brief: current.brief, messages: current.messages };
    },
    context: {
      jobTitle: interview.job.jobTitle,
      jobDescription: interview.job.jobDescription,
      resumeText: interview.resume.text,
      skillPacks: interview.brief?.skillPacks ?? [],
    },
  });
}

/** 流结束后把回合结果写进文档。切段与评分在面试结束后由整理员做（重建阶段 C）。 */
export function applyTrialTurn(id: string, payload: TurnPayload): void {
  writeTrialInterview(applyTurnPayload(requireInterview(id), payload));
}

const evaluating = new Set<string>();

async function evaluateTrialSegment(id: string, segmentId: string): Promise<void> {
  const key = `${id}:${segmentId}`;
  if (evaluating.has(key)) return;
  evaluating.add(key);
  try {
    const interview = requireInterview(id);
    const segment = interview.questions.find((item) => item.id === segmentId);
    if (!segment || segment.skipped || segment.evaluationStatus === "completed") return;
    mutateTrialInterview(id, (current) => setSegmentEvaluation(current, segmentId, { evaluationStatus: "running" }));
    const evaluation = await evaluateSegment({
      segment,
      round: interview.round,
      jobTitle: interview.job.jobTitle,
      jobDescription: interview.job.jobDescription,
      resumeText: interview.resume.text,
      skillPacks: interview.brief?.skillPacks ?? [],
    });
    mutateTrialInterview(id, (current) => setSegmentEvaluation(current, segmentId, { evaluationStatus: "completed", evaluation }));
  } catch (caught) {
    mutateTrialInterview(id, (current) => setSegmentEvaluation(current, segmentId, { evaluationStatus: "failed" }));
    if (isMissingAiConfig(caught)) throw caught;
  } finally {
    evaluating.delete(key);
  }
}

/* ------------------------------ 交卷 ------------------------------ */

/** 与本地版 completeMockInterview 同一顺序：补齐评分 → 汇总 → 报告落文档并写入工作台历史。 */
export async function completeTrialMockSession(id: string): Promise<void> {
  const interview = requireInterview(id);
  if (interview.status === "completed") return;
  if (interview.status !== "ready_to_evaluate" && interview.status !== "evaluating") throw new Error("面试还没有结束。");
  mutateTrialInterview(id, (current) => withStatus(current, "evaluating"));
  try {
    // 先切段（幂等，纯代码）：消息带代码指派的材料 id 与角度，在浏览器里直接切。
    if (interview.questions.length === 0 && interview.brief) {
      const brief = interview.brief;
      const transcript = interview.messages.map((message, seq) => ({ seq, role: message.role, content: message.content, kind: message.role === "interviewer" ? message.kind : null, control: null, topic: message.topic ?? null, facet: message.facet ?? null }));
      const areas = new Map(brief.areas.map((area) => [area.id, area]));
      const segments = cutSegments(transcript, brief).map((segment) => {
        const probes = transcript.filter((line) => line.role === "interviewer" && line.kind === "say" && line.seq > segment.startSeq && line.seq <= segment.endSeq).map((line) => line.content);
        return { id: crypto.randomUUID(), ...segmentRecord(areas.get(segment.areaId)!, segment, probes, interview.round), evaluationStatus: "pending" as const, evaluation: null };
      });
      mutateTrialInterview(id, (current) => ({ ...current, questions: segments, hypotheses: brief.hypotheses.map((item) => ({ id: item.id, status: "open" as const, note: null })) }));
    }
    // 在途的评分等它跑完；失败与还没开始的当场补跑。
    while (requireInterview(id).questions.some((segment) => segment.evaluationStatus === "running")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await Promise.all(segmentsToEvaluate(requireInterview(id)).map((segment) => evaluateTrialSegment(id, segment.id)));
    const current = requireInterview(id);
    // 评分失败的段不卡整份报告（§12.3）：报告里标"评分失败"，总分不计它。
    const brief = current.brief as InterviewBrief;
    const report = await requestReport({
      jobTitle: current.job.jobTitle,
      brief,
      ledger: renderLedger(brief, current.ledger),
      hypotheses: current.hypotheses,
      threads: current.questions.map((segment) => ({
        areaId: typeof segment.metadata.areaId === "string" ? segment.metadata.areaId : null,
        kind: segment.sourceKind,
        label: typeof segment.metadata.areaName === "string" ? segment.metadata.areaName : segment.question.split("\n")[0],
        status: "closed",
        depth: typeof segment.metadata.depth === "number" ? segment.metadata.depth : 0,
        note: typeof segment.metadata.note === "string" ? segment.metadata.note : null,
        questionId: segment.id,
      })),
      questions: current.questions.map((segment) => ({
        id: segment.id,
        skipped: segment.skipped,
        evaluation: segment.evaluation ? { score: segment.evaluation.score, weaknesses: segment.evaluation.weaknesses } : null,
      })),
    });
    const completed = completeTrialInterview(current, report);
    writeTrialInterview(completed);
    // 写入工作台历史：列表、复盘与能力画像都从这里取证据。
    mutateWorkspace((workspace) =>
      addCompletedMockInterview(workspace, {
        id: completed.id,
        companyName: completed.job.companyName,
        jobTitle: completed.job.jobTitle,
        round: completed.round,
        questions: completed.questions.map((segment) => ({
          question: segment.question,
          answer: segment.answer,
          category: segment.category,
          evaluation: segment.evaluation,
        })),
        totalScore: report.totalScore,
        report,
      }),
    );
  } catch (caught) {
    mutateTrialInterview(id, (current) => (current.status === "evaluating" ? withStatus(current, "ready_to_evaluate") : current));
    rethrow(caught, "生成面试报告失败。");
  }
}

/* ------------------------------ 列表与删除 ------------------------------ */

export function trialMockSessions(): TrialInterview[] {
  return listTrialInterviews();
}

/** 删除一场体验版模拟面试：会话文档与工作台记录一起清掉。 */
export function deleteTrialMockSession(id: string): void {
  removeTrialInterview(id);
  mutateWorkspace((workspace) => deleteInterview(workspace, id));
}

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { ensureResumeFromText } from "@/lib/evals/resume-row";
import { getMockInterviewView } from "@/lib/mock-interviews/queries";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { Interviewer, Scorecard, Submission, TaskForInterviewer } from "../types";
import { SCORECARD_INSTRUCTIONS, scorecardSchema } from "./bare";

/**
 * 本仓库的面试官 harness 作为一个提交：通过本地 HTTP 接口开房、逐回合对话、交卷，
 * 再把它的报告翻译成 bench 的评分卡（翻译由本仓库的评分模型做，用与其他提交同一份评分卡说明）。
 * 需要 dev 服务器在 base 上运行；会话打评测标签，不进用户的画像与档案。
 * 收尾：面试官自己发 closing 才算主动收尾；到回合上限时 bench 强制结束，这里只把会话关掉好让报告能生成。
 */

type WireTurn = { replay: boolean; messages?: { role: string; kind: string; content: string }[]; payload?: { phase: string; newMessages: { role: string; kind: string; content: string }[] } };

async function postTurn(base: string, sessionId: string, body: Record<string, unknown>): Promise<{ said: { kind: string; content: string }[]; phase: string | null }> {
  const response = await fetch(`${base}/api/interviews/mock/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`turn ${response.status}: ${raw.slice(0, 200)}`);
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const chunk = JSON.parse(line.slice(6)) as { type?: string; data?: WireTurn };
      if (chunk.type !== "data-turn" || !chunk.data) continue;
      if (chunk.data.replay) return { said: (chunk.data.messages ?? []).filter((m) => m.role === "interviewer"), phase: null };
      return { said: (chunk.data.payload?.newMessages ?? []).filter((m) => m.role === "interviewer"), phase: chunk.data.payload?.phase ?? null };
    } catch {}
  }
  throw new Error(`回合没有返回 data-turn：${raw.slice(-300)}`);
}

async function status(base: string, sessionId: string): Promise<{ status: string; generationError?: string | null }> {
  return (await fetch(`${base}/api/interviews/mock/${sessionId}/status`).then((r) => r.json())) as { status: string; generationError?: string | null };
}

async function waitFor(base: string, sessionId: string, done: (s: string) => boolean, timeoutMs: number, everyMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let current = "";
  while (Date.now() < deadline) {
    const json = await status(base, sessionId);
    current = json.status;
    if (done(current)) return current;
    if (current === "generation_failed" || current === "failed") throw new Error(`备课失败：${json.generationError ?? ""}`);
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  return current;
}

const endSession = (base: string, sessionId: string) => postTurn(base, sessionId, { clientId: "bench-end", content: "", intent: "end" }).catch(() => undefined);

export async function offercomeSubmission(name: string, options: { base: string; tag: string }): Promise<Submission> {
  const interviewerConfig = await getAiTaskConfig("text");
  // 报告 → 评分卡的翻译用文本模型：和 bare:main / script:main 填评分卡的是同一个模型，"harness vs 基线"的差异才归因到 harness。
  // harness 内部逐段评分用的是它自己的评分模型（设置页"面试评分"），那是 harness 的一部分，榜上如实记。
  const translator: AiTaskConfig = { ...interviewerConfig, task: "scoring" };
  const internalScoring = await getAiTaskConfig("scoring");
  const modelName = (c: AiTaskConfig) => `${c.provider}:${c.model}`;
  return {
    name,
    models: { interviewer: modelName(interviewerConfig), scorecard: modelName(translator) },
    notes: `本仓库 harness 经本地 API 驱动；它自己从 JD 抽能力、有自己的面试规范，不吃 bench 的 norms 也拿不到 bench 的能力清单；没有回合上限的输入，长短由面试官看笔记里待验证的说法与最近几句的信息量自己定（2026-09-22 起无配额、无时钟），超过 bench 的 10/16/24 就被 bench 掐断，"主动收尾"这一列要连同被掐断的场次一起读；报告由 harness 内部评分模型 ${modelName(internalScoring)} 产出，再由 ${modelName(translator)} 翻译成评分卡。`,
    create(): Interviewer {
      let task: TaskForInterviewer | null = null;
      let sessionId = "";
      let ended = false;
      return {
        async start(input) {
          task = input;
          const resumeDbId = await ensureResumeFromText(`bench-${input.resume.source.replace(/^.*\//, "").replace(/\.md$/, "")}`, input.resume.text);
          const form = new FormData();
          form.set("companyName", `bench ${input.id}`);
          form.set("jobTitle", input.job.title);
          form.set("resumeId", resumeDbId);
          form.set("pace", input.budget.pace);
          form.set("jobDescriptionText", input.job.description);
          form.set("evalTag", options.tag);
          const response = await fetch(`${options.base}/api/interviews/mock`, { method: "POST", body: form });
          const json = (await response.json()) as { id?: string; error?: string };
          if (!response.ok || !json.id) throw new Error(`创建会话失败：${json.error ?? response.status}`);
          sessionId = json.id;
          await waitFor(options.base, sessionId, (s) => s === "in_progress", 5 * 60_000, 3_000);
        },
        async turn({ candidateSaid, turnIndex }) {
          if (!task) throw new Error("start 没调用");
          // harness 某一步出错时前端会提示"可以重试"，真人会点一次重试；这里也重试一次（同一 clientId，服务端按幂等处理）。
          const body = candidateSaid === null ? { kind: "start" } : { clientId: `bench-${turnIndex}`, content: candidateSaid, intent: null };
          const outcome = await postTurn(options.base, sessionId, body).catch(async (error: unknown) => {
            if (!(error instanceof Error && /可以重试|data-turn/.test(error.message))) throw error;
            return postTurn(options.base, sessionId, body);
          });
          const say = outcome.said.map((m) => m.content).join("\n").trim() || "（面试官沉默）";
          const closing = outcome.said.some((m) => m.kind === "closing") || outcome.phase === "ended";
          if (closing) ended = true;
          else if (turnIndex >= task.budget.maxTurns - 1) {
            // bench 马上会强制结束：把会话关掉好让报告能生成，但这不算主动收尾。
            await endSession(options.base, sessionId);
            ended = true;
          }
          return { say, end: closing };
        },
        async scorecard(): Promise<Scorecard> {
          if (!task) throw new Error("start 没调用");
          if (!ended) await endSession(options.base, sessionId);
          await waitFor(options.base, sessionId, (s) => s === "completed", 6 * 60_000, 4_000);
          return translateReport(task, sessionId, translator);
        },
      };
    },
  };
}

export const OFFERCOME_TRANSLATION_VERSION = "bench-offercome-v3";

/**
 * 把 harness 的报告翻译成 bench 评分卡。v3：报告里逐段评过、能对上某项能力的段，那项能力必须给等级（v2 曾在能力估计全低于阈值时一项不填）。
 * 独立导出：`scripts/bench-retranslate.ts` 用它对已跑完的场次统一重翻译，不重跑面试。
 */
export async function translateReport(task: TaskForInterviewer, sessionId: string, translator: AiTaskConfig): Promise<Scorecard> {
  const view = await getMockInterviewView(sessionId);
  if (!view?.report) throw new Error("报告没有生成");
  const digest = {
    summary: view.report.summary,
    strengths: view.report.strengths,
    weaknesses: view.report.weaknesses,
    hypotheses: view.report.hypotheses,
    estimates: view.estimates.map((e) => ({ competency: e.name, mean: e.mean, samples: e.samples })),
    segments: view.questions.map((q) => ({
      area: q.segment?.areaName ?? null,
      question: q.question,
      score: q.evaluation?.score ?? null,
      verdict: q.evaluation?.verdict ?? null,
      weaknesses: q.evaluation?.weaknesses ?? [],
      resumeChecks: q.evaluation?.resumeChecks ?? [],
      answer: q.answer,
    })),
  };
  const { output } = await runAgent({
    agent: "bench_offercome_scorecard",
    runId: `bench:offercome:${task.id}:scorecard`,
    config: translator,
    feature: "InterviewBench",
    promptVersion: OFFERCOME_TRANSLATION_VERSION,
    schema: scorecardSchema,
    maxOutputTokens: 1_600,
    timeoutMs: 90_000,
    untrustedInputs: "面试报告与候选人发言",
    system: `把一份模拟面试报告翻译成评分卡。报告里有整体总结、逐段评分与短板（带候选人原话）、简历核对、能力估计（0–1 均值）。岗位能力（用这些 id）：\n${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n")}\n${SCORECARD_INSTRUCTIONS}\n等级只用报告里的证据定，不要自己补判断。每一段（segments）先判它主要考哪项能力，被段落考到的能力都必须给等级，依据用那段 answer 里的原话；只有任何一段都没碰到的能力才不填。段落分数只是参考：候选人说不出机制、说是同事做的记 1；讲清怎么做但说不出取舍或验证记 2；有取舍、有数字、有验证记 3。红旗映射：简历核对里数字对不上的记 inflated；逐段短板里 kind=error 的记 wrong；候选人对简历上的成果说不出怎么量、说是同事做的、记不清口径的记 hollow（看 answer 与短板原话）；quote 一律用报告里候选人的原话。`,
    payload: digest,
    rescue: salvageJson(scorecardSchema),
  });
  return output as Scorecard;
}

import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { ensureFixtureResume } from "@/lib/evals/resume-row";
import { getMockInterviewView } from "@/lib/mock-interviews/queries";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { Interviewer, Scorecard, Submission, TaskForInterviewer } from "../types";
import { SCORECARD_INSTRUCTIONS, scorecardSchema } from "./bare";

/**
 * 本仓库的面试官 harness 作为一个提交：通过本地 HTTP 接口开房、逐回合对话、交卷，
 * 再把它的报告翻译成 bench 的评分卡（翻译由评分模型做，和裸模型基线填评分卡是同一件事）。
 * 需要 dev 服务器在 base 上运行；会话打评测标签，不进用户的画像与档案。
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

export function offercomeSubmission(name: string, options: { base: string; tag: string }): Submission {
  return {
    name,
    family: "deepseek",
    create(): Interviewer {
      let task: TaskForInterviewer | null = null;
      let sessionId = "";
      let ended = false;
      return {
        async start(input) {
          task = input;
          const resumeFixture = input.resume.source.replace(/^.*\//, "").replace(/\.md$/, "");
          const resumeDbId = await ensureFixtureResume(resumeFixture);
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
          const outcome = candidateSaid === null ? await postTurn(options.base, sessionId, { kind: "start" }) : await postTurn(options.base, sessionId, { clientId: `bench-${turnIndex}`, content: candidateSaid, intent: null });
          const say = outcome.said.map((m) => m.content).join("\n").trim() || "（面试官沉默）";
          const closing = outcome.said.some((m) => m.kind === "closing") || outcome.phase === "ended";
          if (closing) ended = true;
          // 预算用完时 bench 会强制结束：我们这边用结束按钮把会话收掉，保证交卷能跑。
          if (!closing && turnIndex >= task.budget.maxTurns - 1) {
            await postTurn(options.base, sessionId, { clientId: "bench-end", content: "", intent: "end" }).catch(() => undefined);
            ended = true;
            return { say, end: true };
          }
          return { say, end: closing };
        },
        async scorecard(): Promise<Scorecard> {
          if (!task) throw new Error("start 没调用");
          if (!ended) await postTurn(options.base, sessionId, { clientId: "bench-end", content: "", intent: "end" }).catch(() => undefined);
          await waitFor(options.base, sessionId, (s) => s === "completed", 6 * 60_000, 4_000);
          const view = await getMockInterviewView(sessionId);
          if (!view?.report) throw new Error("报告没有生成");
          const config: AiTaskConfig = await getAiTaskConfig("scoring");
          const digest = {
            summary: view.report.summary,
            strengths: view.report.strengths,
            weaknesses: view.report.weaknesses,
            hypotheses: view.report.hypotheses,
            estimates: view.estimates.map((e) => ({ competency: e.name, mean: e.mean, samples: e.samples })),
            segments: view.questions.map((q) => ({
              area: q.segment?.areaName ?? null,
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
            config,
            feature: "InterviewBench",
            promptVersion: "bench-offercome-v1",
            schema: scorecardSchema,
            maxOutputTokens: 1_600,
            timeoutMs: 90_000,
            untrustedInputs: "面试报告与候选人发言",
            system: `把一份模拟面试报告翻译成评分卡。报告里有整体总结、逐段评分与短板（带候选人原话）、简历核对、能力估计（0–1 均值）。岗位能力（用这些 id）：\n${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n")}\n${SCORECARD_INSTRUCTIONS}\n等级用报告的证据定：只有名词 1、说清机制 2–3、有取舍与验证 4；简历核对不一致的记 inflated 红旗，逐段短板里 kind=error 的记 wrong 红旗，quote 一律用报告里候选人的原话。`,
            payload: digest,
            rescue: salvageJson(scorecardSchema),
          });
          return output as Scorecard;
        },
      };
    },
  };
}

export const offercomeMeta = z.object({ base: z.string().url(), tag: z.string() });

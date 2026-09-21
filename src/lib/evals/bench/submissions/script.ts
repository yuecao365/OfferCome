import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";

import type { Interviewer, Scorecard, Submission, TaskForInterviewer } from "../types";
import { SCORECARD_INSTRUCTIONS, scorecardSchema } from "./bare";

/**
 * 基线二：固定题本。开场用模型按 JD 与简历一次出好 N 道题（每项能力至少一道，按权重分配），
 * 然后不看回答、按顺序问完，最后让模型读整场对话填评分卡。它和裸模型的差别只有一个：不自适应。
 */

const planSchema = z.object({ questions: z.array(z.object({ competencyId: z.string(), question: z.string().min(1).max(300) })).min(3).max(30) });

export function scriptSubmission(name: string, config: AiTaskConfig): Submission {
  return {
    name,
    family: config.provider,
    create(): Interviewer {
      let task: TaskForInterviewer | null = null;
      let questions: string[] = [];
      let cursor = 0;
      const history: { role: "interviewer" | "candidate"; text: string }[] = [];
      return {
        async start(input) {
          task = input;
          const count = Math.max(3, input.budget.maxTurns - 2);
          const { output } = await runAgent({
            agent: "bench_script_plan",
            runId: `bench:script:${input.id}:plan`,
            config,
            feature: "InterviewBench",
            promptVersion: "bench-script-v1",
            schema: planSchema,
            maxOutputTokens: 1_600,
            timeoutMs: 90_000,
            untrustedInputs: "岗位描述与简历",
            system: `你是「${input.job.title}」的技术面试官，按岗位描述和简历一次出好 ${count} 道题，之后按顺序逐题问，不追问。每项能力至少一道，权重高的多出；结合简历里的项目与数字出题；一题一个问号。能力清单：\n${input.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}，权重 ${c.weight}）`).join("\n")}`,
            payload: { jobDescription: input.job.description, resume: input.resume.text },
            rescue: salvageJson(planSchema),
          });
          questions = output.questions.slice(0, count).map((q) => q.question);
        },
        async turn({ candidateSaid, turnIndex }) {
          if (!task) throw new Error("start 没调用");
          if (candidateSaid) history.push({ role: "candidate", text: candidateSaid });
          let say: string;
          let end = false;
          if (turnIndex === 0) say = "你好，先用一两分钟介绍一下你自己和跟这个岗位相关的经历。";
          else if (cursor < questions.length && turnIndex < task.budget.maxTurns - 1) {
            say = questions[cursor];
            cursor += 1;
          } else {
            say = "好的，今天的面试就到这里，感谢你的时间。";
            end = true;
          }
          history.push({ role: "interviewer", text: say });
          return { say, end };
        },
        async scorecard(): Promise<Scorecard> {
          if (!task) throw new Error("start 没调用");
          const { output } = await runAgent({
            agent: "bench_script_scorecard",
            runId: `bench:script:${task.id}:scorecard`,
            config,
            feature: "InterviewBench",
            promptVersion: "bench-script-v1",
            schema: scorecardSchema,
            maxOutputTokens: 1_600,
            timeoutMs: 90_000,
            untrustedInputs: "简历与对话",
            system: `你是刚面完这位候选人的技术面试官，现在填评分卡。岗位能力：\n${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n")}\n${SCORECARD_INSTRUCTIONS}`,
            payload: { resume: task.resume.text, conversation: history.map((h) => `${h.role === "interviewer" ? "面试官" : "候选人"}：${h.text}`).join("\n") },
            rescue: salvageJson(scorecardSchema),
          });
          return output as Scorecard;
        },
      };
    },
  };
}

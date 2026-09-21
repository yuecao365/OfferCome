import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";

import { OVERALLS, type Interviewer, type Scorecard, type Submission, type TaskForInterviewer } from "../types";

/**
 * 基线一：裸模型面试官。一句"你是这个岗位的技术面试官"的系统提示词，整段对话喂给模型，面完让它填评分卡。
 * 没有备课、没有状态、没有约束；所有裸模型基线用同一份提示词，只换模型。
 */

export const scorecardSchema = z.object({
  ratings: z.array(z.object({ competencyId: z.string(), level: z.number().int().min(1).max(4), evidence: z.string().min(1).max(300) })),
  redFlags: z.array(z.object({ type: z.enum(["wrong", "inflated", "hollow"]), quote: z.string().min(1).max(300), note: z.string().max(200) })).max(6),
  overall: z.enum(OVERALLS),
  summary: z.string().min(1).max(400),
});

const turnSchema = z.object({ say: z.string().min(1).max(600), end: z.boolean() });

export const SCORECARD_INSTRUCTIONS = `评分卡：ratings 给每项问到的能力一个等级（1 不会 / 2 知道 / 3 会用 / 4 有判断）和一句逐字摘自候选人发言的依据；没问到的能力不填。redFlags 列候选人说错的（wrong）、数字夸大的（inflated）、简历上写了但说不出细节的（hollow），quote 逐字摘自候选人发言，没有就空数组，不要把"没答上"或"不够严谨"当红旗。overall 四档。summary 两句。`;

function systemPrompt(task: TaskForInterviewer): string {
  return `你是「${task.job.company} · ${task.job.title}」的技术面试官，在做一场约 ${task.budget.maxTurns} 个回合的面试。看岗位描述和候选人的简历，围绕下面这些岗位能力提问：
${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}，权重 ${c.weight}）`).join("\n")}

像真实面试官一样：先请候选人自我介绍；每次只说一段话、只问一个问题；顺着候选人的回答往下追，追到能判断他这项能力到哪一层为止；核实简历上的数字和说法；候选人答不上就换；不透露评分标准；在回合数用完前主动收尾。每回合输出 JSON：say（你这句话）、end（这句是不是收尾告别）。`;
}

export function bareSubmission(name: string, config: AiTaskConfig): Submission {
  return {
    name,
    family: config.provider,
    create(): Interviewer {
      let task: TaskForInterviewer | null = null;
      const history: { role: "interviewer" | "candidate"; text: string }[] = [];
      let turns = 0;
      return {
        async start(input) {
          task = input;
        },
        async turn({ candidateSaid, turnIndex }) {
          if (!task) throw new Error("start 没调用");
          if (candidateSaid) history.push({ role: "candidate", text: candidateSaid });
          turns += 1;
          const mustEnd = turnIndex >= task.budget.maxTurns - 1;
          const { output } = await runAgent({
            agent: "bench_bare_interviewer",
            runId: `bench:bare:${task.id}:${turnIndex}`,
            config,
            feature: "InterviewBench",
            promptVersion: "bench-bare-v1",
            schema: turnSchema,
            maxOutputTokens: 500,
            timeoutMs: 60_000,
            untrustedInputs: "岗位描述、简历与候选人发言",
            system: systemPrompt(task),
            payload: {
              jobDescription: task.job.description,
              resume: task.resume.text,
              conversation: history.map((h) => `${h.role === "interviewer" ? "面试官" : "候选人"}：${h.text}`).join("\n"),
              turn: `${turns} / ${task.budget.maxTurns}${mustEnd ? "（这是最后一回合，必须收尾告别）" : ""}`,
            },
            rescue: salvageJson(turnSchema),
          });
          history.push({ role: "interviewer", text: output.say });
          return { say: output.say, end: output.end || mustEnd };
        },
        async scorecard(): Promise<Scorecard> {
          if (!task) throw new Error("start 没调用");
          const { output } = await runAgent({
            agent: "bench_bare_scorecard",
            runId: `bench:bare:${task.id}:scorecard`,
            config,
            feature: "InterviewBench",
            promptVersion: "bench-bare-v1",
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

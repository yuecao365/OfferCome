import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";

import { LEVEL_ANCHORS, OVERALLS, type Interviewer, type Scorecard, type Submission, type TaskForInterviewer } from "../types";

/**
 * 基线一：裸模型面试官。一句"你是这个岗位的技术面试官"的系统提示词，整段对话喂给模型，面完让它填评分卡。
 * 没有备课、没有状态、没有约束；所有裸模型基线用同一份提示词，只换模型。
 * 收尾由模型自己决定：它知道用到第几回合，但 bench 不替它收尾；到上限被强制结束不算主动收尾。
 */

export const scorecardSchema = z.object({
  ratings: z.array(z.object({ competencyId: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), evidence: z.string().min(1).max(300) })),
  redFlags: z.array(z.object({ type: z.enum(["wrong", "inflated", "hollow"]), quote: z.string().min(1).max(300), note: z.string().max(200) })).max(6),
  overall: z.enum(OVERALLS),
  summary: z.string().min(1).max(400),
});

const turnSchema = z.object({ say: z.string().min(1).max(600), end: z.boolean() });

/** 评分卡说明：所有提交共用（bench 侧的锚点文字），谁也不能自己另写一套等级定义。 */
export const SCORECARD_INSTRUCTIONS = `评分卡：ratings 给每项问到的能力一个等级，每项只填一条，用任务给的能力 id：
1 = ${LEVEL_ANCHORS.low}
2 = ${LEVEL_ANCHORS.medium}
3 = ${LEVEL_ANCHORS.high}
每条附一句逐字摘自候选人发言的依据（evidence）；没问到的能力不填。redFlags 列候选人说错的（wrong）、数字夸大的（inflated）、简历上写了但说不出怎么量 / 怎么做的（hollow），quote 逐字摘自候选人发言，note 一句说明；没有就空数组。知识题没答上、答得不够严谨都不是红旗；但简历上写了的成果，候选人说不出怎么量、说是同事做的、记不清口径，是 hollow。overall 四档。summary 两句。`;

export function conversationText(history: { role: "interviewer" | "candidate"; text: string }[]): string {
  return history.map((h) => `${h.role === "interviewer" ? "面试官" : "候选人"}：${h.text}`).join("\n");
}

/** 一句话的裸提示词 + bench 公开的面试规范（所有提交都拿到同一段）+ 输出格式。没有备课、没有状态、没有别的规则。 */
function systemPrompt(task: TaskForInterviewer): string {
  return `你是「${task.job.company} · ${task.job.title}」的技术面试官，先看岗位描述和简历，围绕岗位能力面一场最多 ${task.budget.maxTurns} 个回合的面试，面完给评分卡。岗位能力：
${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}，权重 ${c.weight}）`).join("\n")}

${task.norms}
每回合输出 JSON：say（你这句话）、end（这句是不是收尾告别）。`;
}

export function bareSubmission(name: string, config: AiTaskConfig): Submission {
  const model = `${config.provider}:${config.model}`;
  return {
    name,
    models: { interviewer: model, scorecard: model },
    notes: "一句话提示词 + bench 公开的面试规范放进系统提示词；面试与评分卡同一个模型。",
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
          const { output } = await runAgent({
            agent: "bench_bare_interviewer",
            runId: `bench:bare:${task.id}:${turnIndex}`,
            config,
            feature: "InterviewBench",
            promptVersion: "bench-bare-v2",
            schema: turnSchema,
            maxOutputTokens: 500,
            timeoutMs: 60_000,
            untrustedInputs: "岗位描述、简历与候选人发言",
            system: systemPrompt(task),
            payload: { jobDescription: task.job.description, resume: task.resume.text, conversation: conversationText(history), turn: `${turns} / ${task.budget.maxTurns}` },
            rescue: salvageJson(turnSchema),
          });
          history.push({ role: "interviewer", text: output.say });
          return { say: output.say, end: output.end };
        },
        async scorecard(): Promise<Scorecard> {
          if (!task) throw new Error("start 没调用");
          const { output } = await runAgent({
            agent: "bench_bare_scorecard",
            runId: `bench:bare:${task.id}:scorecard`,
            config,
            feature: "InterviewBench",
            promptVersion: "bench-bare-v2",
            schema: scorecardSchema,
            maxOutputTokens: 1_600,
            timeoutMs: 90_000,
            untrustedInputs: "简历与对话",
            system: `你是刚面完这位候选人的技术面试官，现在填评分卡。岗位能力：\n${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n")}\n${SCORECARD_INSTRUCTIONS}`,
            payload: { resume: task.resume.text, conversation: conversationText(history) },
            rescue: salvageJson(scorecardSchema),
          });
          return output as Scorecard;
        },
      };
    },
  };
}

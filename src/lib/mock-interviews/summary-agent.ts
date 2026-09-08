import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { InterviewMemory } from "./interviewer/memory";
import type { EvaluationWeakness } from "./question-evaluation";
import { REPORT_WEAKNESS_KINDS, type MockInterviewReport } from "./report";

export const SUMMARY_PROMPT_VERSION = "summary-v2";

/** 汇总 agent 看到的面试全貌：每个领域的深度、面试官判断、分数与短板，加工作记忆和简历假设。 */
export type SummaryInput = {
  jobTitle: string;
  round: string | null;
  pace: string;
  areas: {
    name: string;
    kind: string;
    style: string | null;
    weight: number;
    depthReached: number;
    targetDepth: number;
    threadNote: string | null;
    skipped: boolean;
    score: number | null;
    weaknesses: EvaluationWeakness[];
  }[];
  memory: Pick<InterviewMemory, "established" | "doubtful" | "failed">;
  hypotheses: { text: string; status: "open" | "confirmed" | "refuted"; note: string | null }[];
};

const summarySchema = z.object({
  summary: z.string().min(1).max(1_200),
  strengths: z.array(z.object({ point: z.string().min(1).max(200), areaName: z.string().min(1).max(60) })).max(5),
  weaknesses: z
    .array(
      z.object({
        point: z.string().min(1).max(200),
        areaName: z.string().min(1).max(60).describe("pattern 时填最能代表的那个领域"),
        kind: z.enum(REPORT_WEAKNESS_KINDS),
      }),
    )
    .max(5),
  advice: z.array(z.string().min(1).max(300)).max(5),
  hypotheses: z.array(z.object({ text: z.string().min(1).max(300), verdict: z.string().min(1).max(120) })),
});

export type SummaryOutput = Omit<MockInterviewReport, "version" | "totalScore" | "hypotheses"> & {
  hypotheses: { text: string; verdict: string }[];
};

/** 领域名必须存在；pattern 至少要能对应两个领域的短板，否则降为 missing。 */
function validateSummary(output: z.infer<typeof summarySchema>, input: SummaryInput): SummaryOutput {
  const areaNames = new Set(input.areas.map((area) => area.name));
  const areasWithWeakness = input.areas.filter((area) => area.weaknesses.length > 0).length;
  const area = (name: string) => (areaNames.has(name) ? name : null);
  return {
    summary: output.summary,
    strengths: output.strengths.map((item) => ({ point: item.point, areaName: area(item.areaName) })),
    weaknesses: output.weaknesses.map((item) => ({
      point: item.point,
      areaName: area(item.areaName),
      kind: item.kind === "pattern" && areasWithWeakness < 2 ? "missing" : item.kind,
    })),
    advice: output.advice,
    hypotheses: output.hypotheses,
  };
}

export async function summarizeMockInterview(input: SummaryInput): Promise<SummaryOutput> {
  const { output } = await runAgent({
    agent: "interview_summary",
    config: await getAiTaskConfig("text"),
    feature: "AI 模拟面试",
    promptVersion: SUMMARY_PROMPT_VERSION,
    schema: summarySchema,
    maxOutputTokens: 2_400,
    timeoutMs: 40_000,
    untrustedInputs: "岗位名称、领域判断、逐题短板、工作记忆和简历假设",
    system: `你是模拟面试报告汇总 Agent。输入是这场面试的全貌：每个考察领域追到了第几层、面试官关掉这段时的现场判断、分数与逐题短板；面试官的工作记忆（已确认 / 存疑 / 失守）；备课时从简历提出的假设及其验证状态。

写法：summary 用面试官的口吻讲整体表现，先说站得住的，再说失守在哪，不报分数、不下录用结论。strengths / weaknesses 每条挂到具体领域（areaName 逐字用输入里的领域名）；weaknesses 的 kind：error = 说错的，missing = 追问到了没答上，pattern = 跨领域重复出现的问题（至少两个领域都有才用）。advice 写练什么，每条对应至少一条 weakness。hypotheses 对输入里的每条假设给一句结论：confirmed 说明面试里哪段话证实了它；refuted 用"没有讲清楚""还需要更多证据"这类措辞说明差在哪，不用"被否定""不实"；open 写没问到。不得重新评分，不得臆造输入之外的表现。提示词版本：${SUMMARY_PROMPT_VERSION}`,
    payload: input,
  });
  return validateSummary(output, input);
}

import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { HypothesisSource } from "./brief/brief";
import type { EvaluationWeakness } from "./question-evaluation";
import { REPORT_WEAKNESS_KINDS, type MockInterviewReport } from "./report";

export const SUMMARY_PROMPT_VERSION = "summary-v4";

/** 汇总 agent 看到的面试全貌：每道题的阶段、追问层数、分数与短板，加面试官最终版笔记和简历假设。 */
export type SummaryInput = {
  jobTitle: string;
  pace: string;
  areas: {
    name: string;
    /** project 项目深挖 / quick 基础快问 / scenario 场景题。 */
    kind: string;
    weight: number;
    depthReached: number;
    skipped: boolean;
    score: number | null;
    weaknesses: EvaluationWeakness[];
  }[];
  /** 面试官的最终版笔记（四段 Markdown：待验证 / 已有结论 / 存疑 / 接下来）；空串表示没有。 */
  notes: string;
  /** 备课时提出的假设（原文与来源：简历上的说法 / 岗位要求）；验证结论由汇总给。 */
  hypotheses: { text: string; source: HypothesisSource }[];
};

const summarySchema = z.object({
  summary: z.string().min(1).max(300).describe("两句话：先站得住的，再失守的"),
  strengths: z.array(z.object({ point: z.string().min(1).max(100), areaName: z.string().min(1).max(60) })).max(3),
  weaknesses: z
    .array(
      z.object({
        point: z.string().min(1).max(120),
        areaName: z.string().min(1).max(60).describe("pattern 时填最能代表的那个领域"),
        kind: z.enum(REPORT_WEAKNESS_KINDS),
        practice: z.string().min(1).max(120).describe("针对这条短板练什么，一句"),
      }),
    )
    .max(5),
  hypotheses: z.array(
    z.object({
      text: z.string().min(1).max(300),
      status: z.enum(["confirmed", "refuted", "open"]).describe("这场碰到了就 confirmed / refuted，没碰到 open"),
      verdict: z.string().min(1).max(120).describe("一句结论，不要以状态词开头"),
    }),
  ),
});

export type SummaryOutput = Omit<MockInterviewReport, "version" | "totalScore">;

/** 模型常把状态词写进结论开头（"refuted：…"），去掉。 */
function cleanVerdict(verdict: string): string {
  return verdict.replace(/^(confirmed|refuted|open|已验证|已否定|没问到)\s*[:：,，]?\s*/i, "").trim();
}

/**
 * 领域名必须存在；pattern 至少要能对应两个领域的短板，否则降为 missing。
 * 简历假设以输入为准（模型漏掉的补上）；没问到的结论固定。
 */
function validateSummary(output: z.infer<typeof summarySchema>, input: SummaryInput): SummaryOutput {
  const areaNames = new Set(input.areas.map((area) => area.name));
  const areasWithWeakness = input.areas.filter((area) => area.weaknesses.length > 0).length;
  const area = (name: string) => (areaNames.has(name) ? name : null);
  const judged = new Map(output.hypotheses.map((item) => [item.text, item]));
  return {
    summary: output.summary,
    strengths: output.strengths.map((item) => ({ point: item.point, areaName: area(item.areaName) })),
    weaknesses: output.weaknesses.map((item) => ({
      point: item.point,
      areaName: area(item.areaName),
      kind: item.kind === "pattern" && areasWithWeakness < 2 ? "missing" : item.kind,
      practice: item.practice,
    })),
    hypotheses: input.hypotheses.map(({ text, source }) => {
      const judgement = judged.get(text);
      const status = judgement?.status ?? "open";
      return { text, source, status, verdict: status === "open" ? "这场没有问到。" : cleanVerdict(judgement?.verdict ?? "") };
    }),
  };
}

export async function summarizeMockInterview(input: SummaryInput): Promise<SummaryOutput> {
  const { output } = await runAgent({
    agent: "interview_summary",
    config: await getAiTaskConfig("text"),
    feature: "AI 模拟面试",
    promptVersion: SUMMARY_PROMPT_VERSION,
    schema: summarySchema,
    maxOutputTokens: 1_600,
    timeoutMs: 40_000,
    untrustedInputs: "岗位名称、领域判断、逐题短板、面试官的笔记和简历假设",
    system: `你是模拟面试报告汇总 Agent。输入是这场面试的全貌：每道题属于哪个阶段（project 项目深挖、quick 基础快问、scenario 场景题）、追问了几层、分数与逐题短板；面试官面试结束时的笔记（待验证 / 已有结论 / 存疑 / 接下来四段，它对每条说法的结论与存疑在里面）；备课时提出的假设（source=resume 是简历上的说法，source=jd 是岗位要求，text 是要验什么）。基础快问一题只追一层，答不上就换题，不要把"没追深"当成短板。

写法：一切从简。summary 两句话，用面试官的口吻：第一句站得住的，第二句失守在哪，不报分数、不下录用结论、不逐段复述。strengths 最多 3 条、weaknesses 最多 5 条，每条一句，挂到具体领域（areaName 逐字用输入里的领域名）；weaknesses 的 kind：error = 说错的，missing = 追问到了没答上，pattern = 跨领域重复出现的问题（至少两个领域都有才用）；每条 weakness 带一句 practice（练什么，具体到动作），逐段短板里已有的练法可以直接沿用。hypotheses 对输入里的每条假设给状态和一句结论：这场碰到了就 confirmed / refuted，没碰到 open；verdict 直接写结论不要以状态词开头，confirmed 说明面试里哪段话证实了它，refuted 用"没有讲清楚""还需要更多证据"这类措辞说明差在哪，不用"被否定""不实"。不得重新评分，不得臆造输入之外的表现。提示词版本：${SUMMARY_PROMPT_VERSION}`,
    payload: input,
  });
  return validateSummary(output, input);
}

import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import type { ContentLanguage } from "@/lib/i18n/locale";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { HypothesisSource } from "./brief/brief";
import { validateSummary } from "./outcome";
import type { EvaluationWeakness } from "./question-evaluation";
import { REPORT_WEAKNESS_KINDS, type MockInterviewReport } from "./report";

export const SUMMARY_PROMPT_VERSION = "summary-v4";

/** trace 与缓存按语言区分：中文场次沿用原版本号，英文场次带 -en。 */
function summaryPromptVersion(language: ContentLanguage): string {
  return language === "en" ? `${SUMMARY_PROMPT_VERSION}-en` : SUMMARY_PROMPT_VERSION;
}

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

/** 提示词散文按场次语言各一份；结构、schema、校验只有一份。 */
const COPY = {
  zh: {
    schema: {
      summary: "两句话：先站得住的，再失守的",
      areaName: "pattern 时填最能代表的那个领域",
      practice: "针对这条短板练什么，一句",
      status: "这场碰到了就 confirmed / refuted，没碰到 open",
      verdict: "一句结论，不要以状态词开头",
    },
    untrustedInputs: "岗位名称、领域判断、逐题短板、面试官的笔记和简历假设",
    system: (version: string) => `你是模拟面试报告汇总 Agent。输入是这场面试的全貌：每道题属于哪个阶段（project 项目深挖、quick 基础快问、scenario 场景题）、追问了几层、分数与逐题短板；面试官面试结束时的笔记（待验证 / 已有结论 / 存疑 / 接下来四段，它对每条说法的结论与存疑在里面）；备课时提出的假设（source=resume 是简历上的说法，source=jd 是岗位要求，text 是要验什么）。基础快问一题只追一层，答不上就换题，不要把"没追深"当成短板。

写法：一切从简。summary 两句话，用面试官的口吻：第一句站得住的，第二句失守在哪，不报分数、不下录用结论、不逐段复述。strengths 最多 3 条、weaknesses 最多 5 条，每条一句，挂到具体领域（areaName 逐字用输入里的领域名）；weaknesses 的 kind：error = 说错的，missing = 追问到了没答上，pattern = 跨领域重复出现的问题（至少两个领域都有才用）；每条 weakness 带一句 practice（练什么，具体到动作），逐段短板里已有的练法可以直接沿用。hypotheses 对输入里的每条假设给状态和一句结论：这场碰到了就 confirmed / refuted，没碰到 open；verdict 直接写结论不要以状态词开头，confirmed 说明面试里哪段话证实了它，refuted 用"没有讲清楚""还需要更多证据"这类措辞说明差在哪，不用"被否定""不实"。不得重新评分，不得臆造输入之外的表现。提示词版本：${version}`,
  },
  en: {
    schema: {
      summary: "Two sentences: what held up first, then where it broke down",
      areaName: "For pattern, use the single most representative area",
      practice: "One sentence on what to practise to close this gap",
      status: "confirmed / refuted if this interview touched it, open if it didn't",
      verdict: "One-sentence verdict; don't start with the status word",
    },
    untrustedInputs: "the job title, per-area results, per-segment weaknesses, the interviewer's notes and the résumé hypotheses",
    system: (version: string) => `You are the report-summary agent for a mock technical interview. The input is the whole interview: for each segment, which stage it belongs to (project = project deep dive, quick = quick fundamentals question, scenario = scenario question), how many follow-up levels it went, its score and its per-segment weaknesses; the interviewer's notes at the end of the interview (four sections — to verify / concluded / in doubt / next — holding its conclusions and open doubts about each claim); and the hypotheses set during preparation (source=resume is a claim on the résumé, source=jd is a job requirement, text is what to verify). A quick fundamentals question gets a single follow-up and moves on if the candidate can't answer, so don't treat "wasn't probed deeper" as a weakness.

Style: keep everything lean. summary is two sentences in the interviewer's voice: the first on what held up, the second on where it broke down — no scores, no hiring call, no segment-by-segment recap. At most 3 strengths and at most 5 weaknesses, one sentence each, each tied to a specific area (copy areaName verbatim from the area names in the input). Weakness kind: error = said something wrong, missing = asked in a follow-up and couldn't answer, pattern = the same problem recurring across areas (only when at least two areas show it). Every weakness carries a one-sentence practice (what to practise, down to a concrete action); you may reuse a practice from the per-segment weaknesses. For every hypothesis in the input, give a status and a one-sentence verdict: confirmed / refuted if this interview touched it, open if it didn't. The verdict states the conclusion directly and must not start with the status word: for confirmed, say which part of the interview backed it up; for refuted, say what fell short with wording like "wasn't explained clearly" or "needs more evidence" — never "disproved" or "false". Don't re-score, and don't invent anything beyond the input.

Language: write summary, point, practice and verdict in English, even if the notes, area names or hypotheses are in another language; copy areaName and each hypothesis text verbatim from the input. Prompt version: ${version}`,
  },
} satisfies Record<ContentLanguage, unknown>;

/** 字段与约束两种语言相同；英文同样的意思字符数约是中文的三倍，上限随之放大。 */
function buildSummarySchema(language: ContentLanguage) {
  const text = COPY[language].schema;
  const len = (zh: number) => (language === "en" ? zh * 3 : zh);
  return z.object({
    summary: z.string().min(1).max(len(300)).describe(text.summary),
    strengths: z.array(z.object({ point: z.string().min(1).max(len(100)), areaName: z.string().min(1).max(len(60)) })).max(3),
    weaknesses: z
      .array(
        z.object({
          point: z.string().min(1).max(len(120)),
          areaName: z.string().min(1).max(len(60)).describe(text.areaName),
          kind: z.enum(REPORT_WEAKNESS_KINDS),
          practice: z.string().min(1).max(len(120)).describe(text.practice),
        }),
      )
      .max(5),
    hypotheses: z.array(
      z.object({
        text: z.string().min(1).max(len(300)),
        status: z.enum(["confirmed", "refuted", "open"]).describe(text.status),
        verdict: z.string().min(1).max(len(120)).describe(text.verdict),
      }),
    ),
  });
}

const SUMMARY_SCHEMAS = { zh: buildSummarySchema("zh"), en: buildSummarySchema("en") } satisfies Record<ContentLanguage, unknown>;

export type SummaryOutput = Omit<MockInterviewReport, "version" | "totalScore">;

/** language 是场次语言（brief.language）：提示词、产出与代码补的固定句都按它；缺省中文。 */
export async function summarizeMockInterview(input: SummaryInput, language: ContentLanguage = "zh"): Promise<SummaryOutput> {
  const copy = COPY[language];
  const promptVersion = summaryPromptVersion(language);
  const { output } = await runAgent({
    agent: "interview_summary",
    config: await getAiTaskConfig("text"),
    feature: "AI 模拟面试",
    promptVersion,
    language,
    schema: SUMMARY_SCHEMAS[language],
    maxOutputTokens: 1_600,
    timeoutMs: 40_000,
    untrustedInputs: copy.untrustedInputs,
    system: copy.system(promptVersion),
    payload: input,
  });
  return validateSummary(output, input, language);
}

import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { prisma } from "@/lib/db";
import type { ContentLanguage } from "@/lib/i18n/locale";
import type { EvaluationWeakness } from "@/lib/mock-interviews/question-evaluation";
import type { MockInterviewReport } from "@/lib/mock-interviews/report";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { DOSSIER_HEADINGS, DOSSIER_KEYS, DOSSIER_MAX_CHARS, DOSSIER_SECTION_MAX_LINES, emptyDossier, normalizeDossier } from "./dossier-doc";

/**
 * 候选人档案的读写（G4）。读：同一份简历最新一版（真实使用只读真实场次写的；评测场次连评测写的一起读，与记忆的规则一致）。
 * 写：交卷后由档案 agent 拿着上一版 + 这场的事实整份重写，记一句改动，版本号 +1。写失败不影响报告。
 */

export const DOSSIER_PROMPT_VERSION = "dossier-v1";

/** 按语言的上限（英文同样内容约两倍字符）；中文与原来逐字相同。 */
function dossierSchema(language: ContentLanguage) {
  return z.object({
    /** 整份重写后的档案（Markdown，固定段落）。 */
    body: z.string().min(1).max(DOSSIER_MAX_CHARS[language] + 500),
    /** 这版相对上一版改了什么，一句话。 */
    changes: z.string().min(1).max(language === "en" ? 400 : 200),
  });
}

export type DossierSessionFacts = {
  jobTitle: string;
  companyName: string;
  date: string;
  report: Pick<MockInterviewReport, "summary" | "strengths" | "weaknesses" | "hypotheses">;
  areas: { name: string; kind: string; score: number | null; facetsAsked: string[]; weaknesses: EvaluationWeakness[] }[];
};

export async function loadCandidateDossier(resumeId: string, options: { includeEval: boolean }): Promise<{ version: number; body: string; changes: string } | null> {
  const row = await prisma.candidateDossier.findFirst({
    where: { resumeId, ...(options.includeEval ? {} : { evalTag: null }) },
    orderBy: { version: "desc" },
    select: { version: true, body: true, changes: true },
  });
  return row;
}

const sectionList = (language: ContentLanguage) => DOSSIER_KEYS.map((key, index) => `${index + 1}. ## ${DOSSIER_HEADINGS[language].sections[key]}`).join("\n");
const EN = DOSSIER_HEADINGS.en.sections;

/** 档案 agent 的系统提示词，每种语言一份；档案按这场的语言整份重写（上一版是别的语言的也一并译过来）。 */
const SYSTEM: Record<ContentLanguage, string> = {
  zh: `你是模拟面试的档案 Agent，维护一位候选人跨场的档案（Markdown）。输入是上一版档案（可能是空模板）与这场面试的事实：岗位、日期、报告里的总结 / 强项 / 短板、简历假设的验证结论、每个话题问过的角度与讲透的角度、逐段短板。
整份重写档案，保留固定的五个段落、顺序不变：
${sectionList("zh")}
写法：每条一行，带日期与岗位（例如"2026-09-16 · Agent 开发实习生：…"）；同一件事上几场也出现过的合并成一条并标"×N 场"，不要重复；"没讲清的说法"这场讲清了就移到"已验证的说法"；"反复出现的短板"只收至少两场都出现的，一场的短板放在"场次记录"那场的一行里；"问过的项目角度"按项目列已问过的角度（下一场换角度用）；"场次记录"每场一行（日期、岗位、总体一句）。每段最多 ${DOSSIER_SECTION_MAX_LINES} 条，重要的、最近的排前面，同一件事只留一条（合并后标 ×N 场）；超出的删掉最旧、最不重要的。不写分数、不下录用结论、不臆造输入之外的事实。总长不超过 ${DOSSIER_MAX_CHARS.zh} 字。changes 一句话说这版改了什么。提示词版本：${DOSSIER_PROMPT_VERSION}`,
  en: `You are the dossier agent for mock interviews. You maintain one candidate's dossier across sessions (Markdown). Your input is the previous version of the dossier (possibly an empty template) and the facts of this session: role, date, the report's summary / strengths / weaknesses, the verdicts on the resume claims, the angles asked and the angles fully covered for each topic, and the per-topic weaknesses.
Rewrite the whole dossier in English (translate any earlier entries written in another language), keeping the five fixed sections in this order:
${sectionList("en")}
How to write it: one item per line, each with the date and role (e.g. "2026-09-16 · Agent Engineer Intern: …"); if the same thing also came up in earlier sessions, merge it into one item marked "×N sessions" instead of repeating it; if something under "${EN.unclear}" was cleared up this time, move it to "${EN.verified}"; "${EN.recurringWeaknesses}" only takes weaknesses that showed up in at least two sessions — a one-off weakness goes on that session's line in "${EN.sessions}"; "${EN.anglesAsked}" lists, per project, the angles already asked (so the next session can pick new ones); "${EN.sessions}" has one line per session (date, role, one-sentence overall take). At most ${DOSSIER_SECTION_MAX_LINES} items per section, most important and most recent first, one item per fact (merged items marked ×N sessions); drop the oldest, least important ones beyond that. No scores, no hiring verdicts, no facts beyond the input. Keep the whole thing under ${DOSSIER_MAX_CHARS.en} characters. changes is one sentence saying what this version changed. Prompt version: ${DOSSIER_PROMPT_VERSION}-en`,
};

/** 交卷后写一版档案；返回版本与改动。 */
export async function writeCandidateDossier(input: { resumeId: string; sessionId: string; evalTag: string | null; facts: DossierSessionFacts; /** 这场的语言（brief.language），档案按它整份重写；不给按 zh。 */ language?: ContentLanguage }): Promise<{ version: number; changes: string }> {
  const language = input.language ?? "zh";
  const previous = await loadCandidateDossier(input.resumeId, { includeEval: input.evalTag !== null });
  const { output } = await runAgent({
    agent: "candidate_dossier",
    runId: `dossier:${input.sessionId}`,
    config: await getAiTaskConfig("text"),
    feature: "AI 模拟面试",
    promptVersion: language === "en" ? `${DOSSIER_PROMPT_VERSION}-en` : DOSSIER_PROMPT_VERSION,
    language,
    schema: dossierSchema(language),
    maxOutputTokens: 3_000,
    timeoutMs: 45_000,
    untrustedInputs: language === "en" ? "the previous dossier and the facts of this interview" : "上一版档案与这场面试的事实",
    system: SYSTEM[language],
    payload: { previous: previous?.body ?? emptyDossier(language), previousVersion: previous?.version ?? 0, session: input.facts },
  });
  const latest = await prisma.candidateDossier.findFirst({ where: { resumeId: input.resumeId }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (latest?.version ?? 0) + 1;
  await prisma.candidateDossier.create({
    data: { resumeId: input.resumeId, version, body: normalizeDossier(output.body, language), changes: output.changes.trim(), sessionId: input.sessionId, evalTag: input.evalTag },
  });
  return { version, changes: output.changes.trim() };
}

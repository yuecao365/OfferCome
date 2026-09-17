import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { prisma } from "@/lib/db";
import type { EvaluationWeakness } from "@/lib/mock-interviews/question-evaluation";
import type { MockInterviewReport } from "@/lib/mock-interviews/report";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { DOSSIER_MAX_CHARS, DOSSIER_SECTION_MAX_LINES, DOSSIER_SECTIONS, emptyDossier, normalizeDossier } from "./dossier-doc";

/**
 * 候选人档案的读写（G4）。读：同一份简历最新一版（真实使用只读真实场次写的；评测场次连评测写的一起读，与记忆的规则一致）。
 * 写：交卷后由档案 agent 拿着上一版 + 这场的事实整份重写，记一句改动，版本号 +1。写失败不影响报告。
 */

export const DOSSIER_PROMPT_VERSION = "dossier-v1";

const dossierSchema = z.object({
  /** 整份重写后的档案（Markdown，固定段落）。 */
  body: z.string().min(1).max(DOSSIER_MAX_CHARS + 500),
  /** 这版相对上一版改了什么，一句话。 */
  changes: z.string().min(1).max(200),
});

export type DossierSessionFacts = {
  jobTitle: string;
  companyName: string;
  date: string;
  report: Pick<MockInterviewReport, "summary" | "strengths" | "weaknesses" | "hypotheses">;
  areas: { name: string; kind: string; score: number | null; facetsAsked: string[]; facetsDone: string[]; weaknesses: EvaluationWeakness[] }[];
};

export async function loadCandidateDossier(resumeId: string, options: { includeEval: boolean }): Promise<{ version: number; body: string; changes: string } | null> {
  const row = await prisma.candidateDossier.findFirst({
    where: { resumeId, ...(options.includeEval ? {} : { evalTag: null }) },
    orderBy: { version: "desc" },
    select: { version: true, body: true, changes: true },
  });
  return row;
}

const SYSTEM = `你是模拟面试的档案 Agent，维护一位候选人跨场的档案（Markdown）。输入是上一版档案（可能是空模板）与这场面试的事实：岗位、日期、报告里的总结 / 强项 / 短板、简历假设的验证结论、每个话题问过的角度与讲透的角度、逐段短板。
整份重写档案，保留固定的五个段落、顺序不变：
${DOSSIER_SECTIONS.map((section, index) => `${index + 1}. ## ${section}`).join("\n")}
写法：每条一行，带日期与岗位（例如"2026-09-16 · Agent 开发实习生：…"）；同一件事上几场也出现过的合并成一条并标"×N 场"，不要重复；"没讲清的说法"这场讲清了就移到"已验证的说法"；"反复出现的短板"只收至少两场都出现的，一场的短板放在"场次记录"那场的一行里；"问过的项目角度"按项目列已问过的角度（下一场换角度用）；"场次记录"每场一行（日期、岗位、总体一句）。每段最多 ${DOSSIER_SECTION_MAX_LINES} 条，重要的、最近的排前面，同一件事只留一条（合并后标 ×N 场）；超出的删掉最旧、最不重要的。不写分数、不下录用结论、不臆造输入之外的事实。总长不超过 ${DOSSIER_MAX_CHARS} 字。changes 一句话说这版改了什么。提示词版本：${DOSSIER_PROMPT_VERSION}`;

/** 交卷后写一版档案；返回版本与改动。 */
export async function writeCandidateDossier(input: { resumeId: string; sessionId: string; evalTag: string | null; facts: DossierSessionFacts }): Promise<{ version: number; changes: string }> {
  const previous = await loadCandidateDossier(input.resumeId, { includeEval: input.evalTag !== null });
  const { output } = await runAgent({
    agent: "candidate_dossier",
    runId: `dossier:${input.sessionId}`,
    config: await getAiTaskConfig("text"),
    feature: "AI 模拟面试",
    promptVersion: DOSSIER_PROMPT_VERSION,
    schema: dossierSchema,
    maxOutputTokens: 3_000,
    timeoutMs: 45_000,
    untrustedInputs: "上一版档案与这场面试的事实",
    system: SYSTEM,
    payload: { previous: previous?.body ?? emptyDossier(), previousVersion: previous?.version ?? 0, session: input.facts },
  });
  const latest = await prisma.candidateDossier.findFirst({ where: { resumeId: input.resumeId }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (latest?.version ?? 0) + 1;
  await prisma.candidateDossier.create({
    data: { resumeId: input.resumeId, version, body: normalizeDossier(output.body), changes: output.changes.trim(), sessionId: input.sessionId, evalTag: input.evalTag },
  });
  return { version, changes: output.changes.trim() };
}

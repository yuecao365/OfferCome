import { prisma } from "@/lib/db";
import {
  flushAgentRunPersistence,
  installAgentRunPersistence,
  setAgentRunTag,
} from "@/lib/ai/agent-run-store";
import { buildMockInterviewContext, type MockInterviewContext } from "@/lib/mock-interviews/context";
import { enrichMockInterviewJob } from "@/lib/mock-interviews/jd-enrichment-agent";
import {
  MIN_JD_CHARS_FOR_AUTO_ENRICH,
  needsJobDescriptionReview,
} from "@/lib/mock-interviews/jd-sufficiency";
import { analyzeMockInterviewJob } from "@/lib/mock-interviews/job-analysis-agent";
import { generateMockInterviewPlan } from "@/lib/mock-interviews/question-generation-agent";
import { extractResumeExperiencesFromText } from "@/lib/resumes/extract";

import { assembleGenerationRecord } from "./assemble";
import {
  buildGenerationCases,
  loadJdFixtures,
  loadSyntheticResumeText,
  type GenerationCase,
  type JdDirection,
  type ResumeFixture,
} from "./cases";
import { gradeGeneration } from "./generation-graders";
import { aggregateEvalResults, type CaseRunResult, type EvalReport } from "./report";

/**
 * 完整模式运行器：按用例调用真实的出题链（蓝图 → 补全 → 出题 → 裁决），
 * 记录经统一落点写进 AgentRun（带 tag），跑完从表里读回同一 runId 的行
 * 组装记录并判分——和重放走同一条路，评测同时验证 trace 本身是完整的。
 *
 * 不建会话、不落题目：会话状态机是产品的事，评测只关心链路产出。
 */

export type EvalRunOptions = {
  tag: string;
  k: number;
  directions?: JdDirection[];
  idPrefixes?: string[];
  resumes?: ResumeFixture[];
  /** 每个方向按 id 排序取前 N 组 JD；不填取全部。 */
  samplePerDirection?: number;
  /** 总用例上限。 */
  limit?: number;
  onProgress?: (message: string) => void;
};

export function selectCases(options: EvalRunOptions): GenerationCase[] {
  let fixtures = loadJdFixtures();
  if (options.directions?.length) {
    fixtures = fixtures.filter((jd) => options.directions!.includes(jd.direction));
  }
  if (options.idPrefixes?.length) {
    fixtures = fixtures.filter((jd) =>
      options.idPrefixes!.some((prefix) => jd.id.startsWith(prefix)),
    );
  }
  if (options.samplePerDirection) {
    const seen = new Map<string, number>();
    fixtures = fixtures.filter((jd) => {
      const count = seen.get(jd.direction) ?? 0;
      seen.set(jd.direction, count + 1);
      return count < options.samplePerDirection!;
    });
  }
  const cases = buildGenerationCases(fixtures, options.resumes);
  return options.limit ? cases.slice(0, options.limit) : cases;
}

const contextCache = new Map<string, Promise<MockInterviewContext>>();

async function buildUserContext(jobTitle: string, jobDescription: string) {
  const resume =
    (await prisma.resume.findFirst({ where: { isDefault: true } })) ??
    (await prisma.resume.findFirst({ orderBy: { createdAt: "desc" } }));
  if (!resume) throw new Error("本地没有简历，无法运行 resume=user 的用例。");
  return buildMockInterviewContext({ resumeId: resume.id, jobTitle, jobDescription });
}

/** 合成简历：项目用章节规则抽取（无模型），无历史、无画像，结果确定。 */
function buildSyntheticContext(
  fixture: Exclude<ResumeFixture, "user">,
  jobDescription: string,
): MockInterviewContext {
  const text = loadSyntheticResumeText(fixture);
  const projects = extractResumeExperiencesFromText(text).map((item, index) => ({
    id: `${fixture}-p${index + 1}`,
    name: item.title,
    type: item.type,
    organization: item.organization ?? "",
    description: (item.description ?? item.sourceText).slice(0, 2_000),
  }));
  return {
    jobDescription: jobDescription.trim().slice(0, 30_000),
    resume: { id: fixture, name: `${fixture}.md`, text: text.trim().slice(0, 30_000) },
    projects,
    history: [],
    profile: { revision: 0, insights: [] },
  };
}

function buildCaseContext(kase: GenerationCase): Promise<MockInterviewContext> {
  const key = `${kase.resume}:${kase.jd.id}`;
  let cached = contextCache.get(key);
  if (!cached) {
    cached =
      kase.resume === "user"
        ? buildUserContext(kase.jd.title, kase.jd.jobDescription)
        : Promise.resolve(buildSyntheticContext(kase.resume, kase.jd.jobDescription));
    contextCache.set(key, cached);
  }
  return cached;
}

/** 与 generation.ts 的阶段一致：蓝图 → JD 偏薄则自动补全（太短则直接继续）→ 出题。 */
async function runPipeline(kase: GenerationCase, runId: string): Promise<void> {
  const { jobDescription, title: jobTitle } = kase.jd;
  const context = await buildCaseContext(kase);
  let blueprint = await analyzeMockInterviewJob({
    generationId: runId,
    jobTitle,
    jobDescription,
  });
  if (
    needsJobDescriptionReview(blueprint, kase.questionCount) &&
    jobDescription.trim().length >= MIN_JD_CHARS_FOR_AUTO_ENRICH
  ) {
    try {
      blueprint = await enrichMockInterviewJob({
        generationId: runId,
        jobTitle,
        jobDescription,
        blueprint,
      });
    } catch {
      // 与产品一致：补全失败带原蓝图继续。
    }
  }
  await generateMockInterviewPlan({
    generationId: runId,
    context,
    blueprint,
    jobTitle,
    questionCount: kase.questionCount,
    difficulty: "standard",
    round: "first_interview",
  });
}

export async function runGenerationCase(
  kase: GenerationCase,
  rep: number,
  tag: string,
): Promise<CaseRunResult> {
  const runId = `${tag}:${kase.id}:r${rep}`;
  let error: string | null = null;
  try {
    await runPipeline(kase, runId);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  await flushAgentRunPersistence();

  const rows = await prisma.agentRun.findMany({ where: { runId } });
  const record = assembleGenerationRecord(rows);
  return {
    caseId: kase.id,
    direction: kase.jd.direction,
    resume: kase.resume,
    rep,
    runId,
    error,
    promptVersion: record?.promptVersion ?? null,
    model: record?.model ?? null,
    totalTokens: record?.totalTokens ?? 0,
    durationMs: record?.durationMs ?? 0,
    verdicts: record ? gradeGeneration(record, kase.expect) : [],
  };
}

export async function runEval(options: EvalRunOptions): Promise<EvalReport> {
  installAgentRunPersistence();
  setAgentRunTag(options.tag);
  const cases = selectCases(options);
  const results: CaseRunResult[] = [];
  const total = cases.length * options.k;

  try {
    for (const kase of cases) {
      for (let rep = 1; rep <= options.k; rep += 1) {
        const result = await runGenerationCase(kase, rep, options.tag);
        results.push(result);
        const failed = result.verdicts.filter((v) => v.status === "fail").map((v) => v.grader);
        options.onProgress?.(
          `[${results.length}/${total}] ${kase.id} r${rep} ` +
            (result.error ? `ERROR ${result.error.slice(0, 80)}` : failed.length ? `FAIL ${failed.join(",")}` : "PASS") +
            ` ${result.totalTokens} tok ${result.durationMs} ms`,
        );
      }
    }
  } finally {
    setAgentRunTag(null);
  }

  return aggregateEvalResults({ id: options.tag, tag: options.tag, k: options.k, results });
}

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { flushAgentRunPersistence, installAgentRunPersistence, setAgentRunTag } from "../src/lib/ai/agent-run-store";
import { prisma } from "../src/lib/db";
import { loadEvalModels, type EvalModels } from "../src/lib/evals/models";
import { ensureFixtureResume } from "../src/lib/evals/resume-row";
import { parseThreadVerdict } from "../src/lib/mock-interviews/verdicts";
import {
  EVAL_DIR,
  loadCandidateScripts,
  loadJdFixture,
  loadPersonas,
  loadResumeText,
  loadScorerCases,
  writeFixture,
  type CandidateScript,
  type Persona,
  type ScorerCase,
  type ScorerVariant,
  SCORER_VARIANTS,
} from "../src/lib/evals/fixtures";
import {
  briefCoverageText,
  COVERAGE_ROLES,
  coverageMetricRows,
  flattenCoverageMetrics,
  loadCoverageConfig,
  loadTopics,
  summarizeRoleCoverage,
  TOPICS_FILE,
  type BriefCoverage,
  type CoverageRole,
  type TopicsFile,
} from "../src/lib/evals/coverage";
import {
  extractFileTopics,
  finalizeScorerCase,
  generateOfftopicAnswer,
  generateResume,
  generatePersona,
  generateScorerCase,
  mergeRoleTopics,
  type FileTopic,
  type ScorerCaseSource,
} from "../src/lib/evals/generate";
import { calibrateJudge, calibrationFromVerdicts, judgeMany, judgeOne, loadCalibrationSet, saveCalibrationSet, type JudgeCalibration, type JudgeItem } from "../src/lib/evals/judge";
import {
  flattenScorerMetrics,
  judgeScorerCase,
  scorerMetricRows,
  summarizeScorer,
  type ScorerCaseResult,
  type VariantRun,
} from "../src/lib/evals/metamorphic";
import { compareMetrics, gitState, renderMetricTable, type MetricValue, type RunEnvelope } from "../src/lib/evals/report";
import { simulateCandidateReply, type TranscriptLine } from "../src/lib/evals/simulator";
import { parseJsonValue } from "../src/lib/json";
import { isAreaKind, parseStoredBrief, type InterviewBrief } from "../src/lib/mock-interviews/brief/brief";
import { BRIEF_PROMPT_VERSION, generateInterviewBrief } from "../src/lib/mock-interviews/brief/brief-agent";
import { analyzeMockInterviewJob } from "../src/lib/mock-interviews/job-analysis-agent";
import { EVALUATION_PROMPT_VERSION, evaluateMockInterviewQuestion } from "../src/lib/mock-interviews/question-evaluation-agent";
import { parseStoredEvaluationList, type EvaluationStrength, type EvaluationWeakness } from "../src/lib/mock-interviews/question-evaluation";
import { parseStoredReport } from "../src/lib/mock-interviews/report";

/**
 * 评测运行器。必须用 react-server 条件跑，让 server-only 解析成空模块：
 *   npm run eval -- fixtures [--personas 3] [--scorer 40 [--from-sessions --eval-tag <tag>]] [--jd tencent-hunyuan-backend] [--mianjing] [--resumes]
 *   npm run eval -- scorer [--k 3] [--label name] [--cases a,b] [--resume]
 *   npm run eval -- coverage [--k 2] [--label name] [--roles backend,infra]
 *   npm run eval -- compare eval/runs/a.json eval/runs/b.json
 * 产物写到 eval/runs/<label>-<kind>.json，终端打印 markdown 表。
 */

const RUNS_DIR = path.join(EVAL_DIR, "runs");
const DEFAULT_BASE = "http://localhost:3000";
const MAX_TURNS = 30;
/** 人设到这一回合还没说出错句 Z，就让模拟器主动带出来；否则快速节奏的两条线程可能根本问不到弱项。 */
const FORCE_CLAIM_AFTER_TURN = 3;
/** 再往后模拟器还没说，就由运行器把 Z 接在回答末尾：评测要的是面试官对已知错句的反应，谁把它说出来不重要。 */
const APPEND_CLAIM_AFTER_TURN = 5;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function argList(name: string): string[] | null {
  const value = argValue(name);
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : null;
}

function label(): string {
  return argValue("--label") ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function envelope(kind: RunEnvelope["kind"], models: EvalModels, k: number, promptVersions: Record<string, string>): RunEnvelope {
  return {
    label: label(),
    kind,
    createdAt: new Date().toISOString(),
    git: gitState(),
    models: { main: `${models.main.provider}/${models.main.model}`, aux: `${models.aux.provider}/${models.aux.model}`, auxSameFamily: models.auxSameFamily },
    promptVersions,
    k,
  };
}

async function writeRun(kind: string, body: unknown): Promise<string> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const file = path.join(RUNS_DIR, `${label()}-${kind}.json`);
  await fs.writeFile(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return file;
}

/* ---------------------------------------------------------------- fixtures */

async function scorerSources(limit: number, existing: Set<string>, evalTag: string | null): Promise<ScorerCaseSource[]> {
  const questions = await prisma.interviewQuestion.findMany({
    where: {
      answer: { not: null },
      evaluation: { is: { generationMetadataJson: { contains: "\"areaId\"" } } },
      // 只用评测会话的题目，不碰用户自己的面试。
      interview: { evalTag: evalTag ?? { startsWith: "eval-interviewer:" } },
    },
    orderBy: { createdAt: "desc" },
    include: { evaluation: true, interview: { include: { mockSession: { select: { jdTextSnapshot: true, briefJson: true } } } } },
    take: limit * 3,
  });
  // 人设场次里面试官会当场反驳错句，那句反驳留在题目文本里等于把答案告诉评分器：这类题目不用。
  const personaClaims = loadPersonas().flatMap((persona) => (persona.weak ? [persona.weak.wrongClaim.replace(/[。！？]$/, "")] : []));
  const sources: ScorerCaseSource[] = [];
  for (const question of questions) {
    if (existing.has(question.id) || !question.evaluation || !question.interview.mockSession) continue;
    if (/说法不对|这个说法/.test(question.question) || personaClaims.some((claim) => question.question.includes(claim.slice(0, 12)))) continue;
    const metadata = (parseJsonValue(question.evaluation.generationMetadataJson) ?? {}) as Record<string, unknown>;
    const rubric = parseJsonValue(question.evaluation.rubricJson) as ScorerCase["rubric"] | null;
    if (!rubric?.length) continue;
    sources.push({
      id: `q-${question.id.slice(-8)}`,
      questionId: question.id,
      jobTitle: question.interview.jobTitle,
      jobDescription: question.interview.mockSession.jdTextSnapshot,
      round: question.interview.round,
      question: question.question,
      rubric,
      expectedSignals: (parseJsonValue(question.evaluation.expectedSignalsJson) as string[] | null) ?? [],
      thread: {
        kind: isAreaKind(metadata.areaKind) ? metadata.areaKind : "scenario",
        depth: Number(metadata.depth ?? 0),
        probeCount: Number(metadata.probeCount ?? 0),
        hinted: metadata.hinted === true,
        verdict: parseThreadVerdict(metadata.verdict),
        note: typeof metadata.note === "string" ? metadata.note : null,
        facets: Array.isArray(metadata.facets) ? (metadata.facets as unknown[]).filter((item): item is string => typeof item === "string") : [],
      },
    });
    if (sources.length >= limit) break;
  }
  return sources;
}

/**
 * 评分器用例的题目来源：按 eval/coverage.json 的 5 岗位 × 2 份 JD 各备一次课（深入节奏），
 * 每道基础题与场景题出一道用例（问题 + 追问方向当追问）。题目跨五个方向，错句才有得选；
 * 只用评测面试的题目时全在一份简历的两个项目上打转，错句十道雷同。
 */
async function scorerSourcesFromBriefs(existing: Set<string>, limit: number): Promise<(ScorerCaseSource & { role: string })[]> {
  const config = loadCoverageConfig();
  const perRole: Record<string, (ScorerCaseSource & { role: string })[]> = {};
  for (const [role, entry] of Object.entries(config.roles)) {
    perRole[role] = [];
    for (const jdId of entry?.jds ?? []) {
      const jd = loadJdFixture(jdId);
      const brief = await generateEvalBrief(jdId, entry!.resume, "scorer-source");
      for (const area of brief.areas) {
        // 只用基础题与场景题：项目题绑定简历。
        if (area.kind === "project") continue;
        // 每次备课的题 id 都从 q1 / s1 开始编，只用 id 会把不同内容的新题当成已有的；带上问题的短哈希。
        const digest = createHash("sha1").update(area.entryQuestion).digest("hex").slice(0, 6);
        const questionId = `${jdId}:${area.id}:${digest}`;
        if (existing.has(questionId) || existing.has(`${jdId}:${area.id}`)) continue;
        perRole[role].push({
          id: `${jdId.replace(/[^a-z0-9-]/g, "")}-${area.id.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${digest}`,
          questionId,
          role,
          jobTitle: jd.title,
          jobDescription: jd.jobDescription,
          round: "first_interview",
          question: [area.entryQuestion.trim(), ...area.guides.map((guide, index) => `追问 ${index + 1}：${guide.trim()}`)].join("\n"),
          rubric: area.rubric,
          expectedSignals: area.expectedSignals,
          thread: { kind: area.kind, depth: area.guides.length, probeCount: area.guides.length, hinted: false, verdict: null, note: null, facets: area.guides },
        });
      }
      console.log(`${role} / ${jdId}：${brief.areas.filter((area) => area.kind !== "project").length} 道`);
    }
  }
  // 轮流从各岗位取，保证五个方向都有。
  const sources: (ScorerCaseSource & { role: string })[] = [];
  const queues = Object.values(perRole);
  for (let round = 0; sources.length < limit && queues.some((queue) => queue.length > round); round += 1) {
    for (const queue of queues) if (queue[round] && sources.length < limit) sources.push(queue[round]);
  }
  return sources;
}

/** 覆盖率配置里每个岗位的合成简历：缺的按该岗位第一份 JD 生成，参考已有的后端简历；已有的不动。 */
async function buildRoleResumes(models: EvalModels): Promise<void> {
  const config = loadCoverageConfig();
  const reference = loadResumeText("synthetic-backend");
  for (const [role, entry] of Object.entries(config.roles)) {
    if (!entry) continue;
    const file = path.join(EVAL_DIR, "resumes", `${entry.resume}.md`);
    if (await fs.stat(file).then(() => true, () => false)) continue;
    const jd = loadJdFixture(entry.jds[0]);
    const markdown = await generateResume(models.aux, { role, jobTitle: jd.title, jobDescription: jd.jobDescription, reference });
    await fs.writeFile(file, `${markdown}\n`, "utf8");
    console.log(`${role}：写入 ${file}（${markdown.length} 字）`);
  }
}

async function commandFixtures(models: EvalModels): Promise<void> {
  const jdId = argValue("--jd") ?? "tencent-hunyuan-backend";
  const resumeId = argValue("--resume") ?? "synthetic-backend";
  const personaCount = Number(argValue("--personas") ?? 0);
  const scorerCount = Number(argValue("--scorer") ?? 0);
  const mianjing = process.argv.includes("--mianjing");
  const resumes = process.argv.includes("--resumes");
  if (!personaCount && !scorerCount && !mianjing && !resumes) throw new Error("指定 --personas N、--scorer N、--mianjing 或 --resumes。");
  if (mianjing) await buildTopics(models);
  if (resumes) await buildRoleResumes(models);
  const jd = loadJdFixture(jdId);
  const resumeText = loadResumeText(resumeId);

  if (personaCount) {
    // 弱项话题要落在备课会考察的领域里，先备一次课拿领域清单（深入节奏，看全貌）。
    const reference = await generateEvalBrief(jdId, resumeId, "persona-reference");
    const areas = reference.areas.filter((area) => area.kind !== "project").map((area) => ({ name: area.name, question: area.entryQuestion, guides: area.guides }));
    console.log(`参考简报的题：${areas.map((area) => area.name).join("；")}`);
    const current = loadPersonas();
    const existing = new Set(current.map((persona) => persona.id));
    const usedTopics = current.flatMap((persona) => (persona.weak ? [persona.weak.topic] : []));
    const usedClaims = current.flatMap((persona) => (persona.unsupportable ? [persona.unsupportable] : []));
    const wanted = [
      ...Array.from({ length: personaCount }, (_, index) => ({ id: `persona-${index + 1}`, offtopic: false, control: false })),
      { id: "offtopic-1", offtopic: true, control: false },
      { id: "control-1", offtopic: false, control: true },
    ];
    for (const item of wanted) {
      if (existing.has(item.id)) {
        console.log(`人设 ${item.id} 已存在，跳过`);
        continue;
      }
      const persona = await generatePersona(models.aux, {
        id: item.id,
        jd,
        resumeId,
        resumeText,
        offtopic: item.offtopic,
        control: item.control,
        avoidTopics: usedTopics,
        avoidClaims: usedClaims,
        areas,
      });
      if (persona.weak) usedTopics.push(persona.weak.topic);
      if (persona.unsupportable) usedClaims.push(persona.unsupportable);
      writeFixture("personas", persona);
      console.log(persona.weak ? `人设 ${persona.id}：弱项「${persona.weak.topic}」，错句「${persona.weak.wrongClaim}」` : `对照人设 ${persona.id}：强项 ${persona.strong.join("、")}`);
    }
  }

  if (scorerCount) {
    const current = loadScorerCases();
    const existing = new Set(current.map((item) => item.questionId));
    const sources = process.argv.includes("--from-sessions")
      ? (await scorerSources(scorerCount, existing, argValue("--eval-tag") ?? null)).map((source) => ({ ...source, role: "backend" }))
      : await scorerSourcesFromBriefs(existing, scorerCount);
    if (!sources.length) {
      console.log("没有可用的题目来源。");
      return;
    }
    // 答非所问变体：认真回答另一个方向的真实面经题，和本题没有共同话题。
    const topicsFile = loadTopics();
    const foreignFor = (role: string) =>
      COVERAGE_ROLES.filter((item) => item !== role).flatMap((item) => topicsFile.roles[item]?.topics.flatMap((topic) => topic.examples.slice(0, 1)) ?? []);
    const usedClaims = current.map((item) => item.truth.wrongClaim);
    let written = 0;
    for (const [index, source] of sources.entries()) {
      try {
        const partial = await generateScorerCase(models.aux, { source, avoidClaims: usedClaims });
        const foreign = foreignFor(source.role);
        const unrelatedQuestion = foreign[(current.length + index) % foreign.length];
        const offtopic = await generateOfftopicAnswer(models.aux, { unrelatedQuestion });
        const item = finalizeScorerCase({ ...partial, role: source.role }, offtopic);
        const problems = await checkScorerCase(models.aux, item, usedClaims);
        if (problems.length) {
          console.warn(`评分器用例 ${source.id} 体检不过，丢弃：${problems.join("；")}｜Z「${item.truth.wrongClaim}」｜题「${item.question.slice(0, 60).replace(/\n/g, " ")}」`);
          continue;
        }
        usedClaims.push(item.truth.wrongClaim);
        writeFixture("scorer", item);
        written += 1;
        console.log(`评分器用例 ${source.id}：Z「${item.truth.wrongClaim}」`);
      } catch (error) {
        if (isBillingError(error)) throw error;
        console.warn(`评分器用例 ${source.id} 生成失败：`, error instanceof Error ? error.message : error);
      }
    }
    console.log(`写入 ${written} 道评分器用例；现有 ${loadScorerCases().length} 道。`);
  }
}

/* ---------------------------------------------------------- 面经话题表 */

const MIANJING_DIR = path.join(EVAL_DIR, "mianjing", "extracted");

/** eval/mianjing/extracted/*.json → eval/mianjing/topics.json（话题表进仓库，原文与题目列表不进）。 */
async function buildTopics(models: EvalModels): Promise<void> {
  const files = (await fs.readdir(MIANJING_DIR)).filter((name) => name.endsWith(".json") && !name.startsWith("_")).sort();
  const only = argList("--roles");
  const byRole = new Map<CoverageRole, { file: string; questions: string[] }[]>();
  for (const name of files) {
    const json = JSON.parse(await fs.readFile(path.join(MIANJING_DIR, name), "utf8")) as { role?: string; questions?: string[] };
    const role = COVERAGE_ROLES.find((item) => item === json.role);
    if (!role || !json.questions?.length || (only && !only.includes(role))) continue;
    byRole.set(role, [...(byRole.get(role) ?? []), { file: name, questions: json.questions }]);
  }
  if (!byRole.size) throw new Error(`${MIANJING_DIR} 里没有带 role 的面经 JSON；先跑 node eval/mianjing/extract-questions.mjs。`);
  const roles: TopicsFile["roles"] = {};
  for (const [role, items] of byRole) {
    const fileTopics: FileTopic[] = [];
    for (const item of items) {
      try {
        fileTopics.push(...(await extractFileTopics(models.aux, { role, file: item.file, questions: item.questions })));
      } catch (error) {
        console.warn(`${item.file} 话题抽取失败：`, error instanceof Error ? error.message : error);
      }
    }
    const topics = await mergeRoleTopics(models.aux, { role, items: fileTopics });
    roles[role] = { files: items.length, topics };
    console.log(`${role}: ${items.length} 篇 → ${fileTopics.length} 条 → ${topics.length} 个话题；前五：${topics.slice(0, 5).map((topic) => `${topic.name}(${topic.count})`).join("、")}`);
  }
  // 只跑部分岗位时保留文件里其余岗位的话题表。
  const existing = await fs.readFile(TOPICS_FILE, "utf8").then((text) => (JSON.parse(text) as TopicsFile).roles).catch(() => ({}));
  const body: TopicsFile = { generatedAt: new Date().toISOString(), aux: `${models.aux.provider}/${models.aux.model}`, roles: { ...existing, ...roles } };
  await fs.writeFile(TOPICS_FILE, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  console.log(`写入 ${TOPICS_FILE}`);
}

/* ---------------------------------------------------------------- coverage */

/** 只跑备课（蓝图 + 简报），不开面试；上下文里没有画像与历史，简报只由 JD 与合成简历决定。 */
async function generateEvalBrief(jdId: string, resumeId: string, runLabel: string): Promise<InterviewBrief> {
  const jd = loadJdFixture(jdId);
  const generationId = `eval-brief:${runLabel}:${jdId}:${Date.now()}`;
  const blueprint = await analyzeMockInterviewJob({ generationId, jobTitle: jd.title, jobDescription: jd.jobDescription });
  const brief = await generateInterviewBrief({
    generationId,
    jobTitle: jd.title,
    blueprint,
    context: {
      jobDescription: jd.jobDescription,
      resume: { id: `eval-${resumeId}`, name: `eval-${resumeId}.md`, text: loadResumeText(resumeId) },
      projects: [],
      recentWeaknesses: [],
      recentTopics: [],
      recentQuestions: [],
    },
    // 深入节奏：看备课最多能规划出什么；真实面试按用户节奏裁剪，是另一回事。
    pace: "deep",
    round: "first_interview",
  });
  // 备课 agent 失败时会退回代码兜底的简报；评测里那不是被测对象，当失败处理。
  if (brief.source === "fallback") throw new Error(`备课失败，退回了兜底简报（${jdId}）`);
  return brief;
}

function topicText(topic: { name: string; description: string }): string {
  return `${topic.name}：${topic.description}`;
}

/** 校准样本要和真实样本同一形状：把一道面经原题包成简报里的一道题。 */
function asBriefArea(question: string): string {
  return `【考察点】问题：${question}。追问：1. 追问它的原理；2. 追问它在真实场景里的取舍`;
}

async function commandCoverage(models: EvalModels): Promise<void> {
  const k = Number(argValue("--k") ?? 1);
  const only = argList("--roles");
  const topicsFile = loadTopics();
  const config = loadCoverageConfig();
  const roles = COVERAGE_ROLES.filter((role) => (!only || only.includes(role)) && topicsFile.roles[role] && config.roles[role]);
  for (const role of roles) loadResumeText(config.roles[role]!.resume);
  if (!roles.length) throw new Error("没有可跑的岗位：检查 topics.json 与 eval/coverage.json。");
  setAgentRunTag(`eval-coverage:${label()}`);

  // topic 裁判自校准：正样本 = (话题, 它自己的面经原题)；负样本 = (话题, 别的岗位的原题)。
  const positives: JudgeItem[] = [];
  const negatives: JudgeItem[] = [];
  for (const role of roles) {
    const others = roles.filter((item) => item !== role);
    for (const topic of topicsFile.roles[role]!.topics.slice(0, 8)) {
      positives.push({ a: topicText(topic), b: asBriefArea(topic.examples[0]) });
      const pool = others.length
        ? topicsFile.roles[others[positives.length % others.length]]!.topics
        : topicsFile.roles[role]!.topics.filter((item) => item.id !== topic.id);
      const foreign = pool[positives.length % pool.length];
      if (foreign) negatives.push({ a: topicText(topic), b: asBriefArea(foreign.examples[0]) });
    }
  }
  let topicSet = loadCalibrationSet("topic");
  if (!topicSet) {
    topicSet = { kind: "topic", positives, negatives };
    saveCalibrationSet(topicSet);
  }
  const [positiveVerdicts, negativeVerdicts] = await Promise.all([judgeMany(models.aux, "topic", topicSet.positives), judgeMany(models.aux, "topic", topicSet.negatives)]);
  const calibration = calibrationFromVerdicts("topic", positiveVerdicts, negativeVerdicts);
  console.log(`裁判 topic：准确率 ${calibration.accuracy.value?.toFixed(2) ?? "—"} (${calibration.accuracy.numerator}/${calibration.accuracy.denominator})${calibration.trusted ? "" : "，不可信"}`);

  // 产物存简报全文：覆盖率异常时能直接核对裁判看到的内容，不用重跑。
  const briefs: (BriefCoverage & { areas: string[]; text: string })[] = [];
  for (const role of roles) {
    const topics = topicsFile.roles[role]!.topics;
    for (const jdId of config.roles[role]!.jds) {
      for (let rep = 1; rep <= k; rep += 1) {
        console.log(`\n=== ${role} / ${jdId} #${rep}`);
        try {
          const brief = await generateEvalBrief(jdId, config.roles[role]!.resume, label());
          const text = briefCoverageText(brief);
          const verdicts = await judgeMany(models.aux, "topic", topics.map((topic) => ({ a: topicText(topic), b: text })));
          const covered = Object.fromEntries(topics.map((topic, index) => [topic.id, calibration.trusted ? verdicts[index] : null]));
          const areas = brief.areas.map((area) => `${area.name}（${area.kind}）`);
          briefs.push({
            role,
            jd: jdId,
            rep,
            covered,
            areaCount: brief.areas.length,
            baselineAreaCount: brief.areas.filter((area) => area.topic).length,
            skillPacks: brief.skillPacks,
            areas,
            text,
          });
          console.log(`  题：${areas.join("；")}\n  技能包：${brief.skillPacks.join(", ") || "无"}；覆盖 ${Object.values(covered).filter(Boolean).length}/${topics.length}`);
        } catch (error) {
          if (isBillingError(error)) throw error;
          console.warn(`  失败：`, error instanceof Error ? error.message : error);
        }
      }
    }
  }
  await flushAgentRunPersistence();
  const metrics = roles.map((role) => summarizeRoleCoverage(role, topicsFile.roles[role]!.topics, briefs.filter((brief) => brief.role === role)));
  const body = {
    ...envelope("coverage", models, k, { blueprint: "job_blueprint", brief: BRIEF_PROMPT_VERSION }),
    topicsGeneratedAt: topicsFile.generatedAt,
    judges: [calibration],
    metrics: flattenCoverageMetrics(metrics),
    roles: metrics,
    briefs,
  };
  const file = await writeRun("coverage", body);
  console.log(`\n${renderMetricTable(coverageMetricRows(metrics, calibration.trusted))}\n\n产物：${file}`);
}

/* ------------------------------------------------------------- 用例体检 */

/** 额度、鉴权这类错误再试也没用，整个运行立刻停。 */
function isBillingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /credits|quota|billing|401|insufficient|余额|额度/i.test(message);
}

/** 生成后的自动体检：错句针对题目、与已有错句不重复、答非所问确实跑题、变体关系成立。 */
async function checkScorerCase(aux: EvalModels["aux"], item: ScorerCase, usedClaims: string[]): Promise<string[]> {
  const problems: string[] = [];
  const lettersOnly = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "");
  const z = lettersOnly(item.truth.wrongClaim);
  for (const used of usedClaims) {
    const u = lettersOnly(used);
    const shorter = z.length <= u.length ? z : u;
    let shared = 0;
    for (let i = 0; i + 8 <= shorter.length; i += 1) if ((shorter === z ? u : z).includes(shorter.slice(i, i + 8))) shared += 1;
    if (shorter.length >= 8 && shared / (shorter.length - 7) > 0.5) {
      problems.push(`错句与已有用例重复：${used}`);
      break;
    }
  }
  const onTopic = await judgeOne(aux, "claim", { a: item.question, b: item.truth.wrongClaim });
  if (onTopic === false) problems.push("错句不针对题目所问的机制");
  const offRelated = await judgeOne(aux, "related", { a: item.answers.base, b: item.answers.offtopic });
  if (offRelated === true) problems.push("答非所问变体与本题相关");
  if (item.answers.drop.length >= item.answers.base.length) problems.push("drop 不比 base 短");
  if (item.answers.fluff.length < 80) problems.push("fluff 太短");
  return problems;
}

/** 评分跑前的冒烟门槛：前 3 道各评 1 次，空话与答非所问必须都低于原版，否则停下来查数据。 */
async function scorerSmokeGate(cases: ScorerCase[]): Promise<void> {
  for (const item of cases.slice(0, 3)) {
    const scores: Record<string, number> = {};
    for (const variant of ["base", "fluff", "offtopic"] as const) {
      const result = await evaluateMockInterviewQuestion({
        question: item.question,
        answer: item.answers[variant],
        rubric: item.rubric,
        expectedSignals: item.expectedSignals,
        jobTitle: item.jobTitle,
        jobDescription: item.jobDescription,
        thread: { kind: item.thread.kind, depth: item.thread.depth, probeCount: item.thread.probeCount, facets: item.thread.facets },
        round: item.round,
        competencies: [],
      });
      scores[variant] = result.score;
    }
    console.log(`冒烟 ${item.id}: base ${scores.base} fluff ${scores.fluff} offtopic ${scores.offtopic}`);
    if (scores.fluff >= scores.base || scores.offtopic >= scores.base) {
      throw new Error(`冒烟门槛不过（${item.id}）：空话或答非所问不低于原版，先查用例数据再跑。`);
    }
  }
}

/* ------------------------------------------------------------------ scorer */

/**
 * 同名产物里已经跑完整（每个变体都有 k 次）的用例；`--resume` 时直接复用，
 * 网络中断只需重跑没跑完的用例。每跑完一道就落盘，所以中断后产物总是可续的。
 */
async function completedScorerResults(k: number): Promise<{ done: Map<string, ScorerCaseResult>; envelope: RunEnvelope | null }> {
  const file = path.join(RUNS_DIR, `${label()}-scorer.json`);
  const text = await fs.readFile(file, "utf8").catch(() => null);
  const previous = text ? (JSON.parse(text) as RunEnvelope & { results?: ScorerCaseResult[] }) : null;
  const complete = (previous?.results ?? []).filter((result) => SCORER_VARIANTS.every((variant) => result.runs[variant]?.length === k));
  return { done: new Map(complete.map((result) => [result.caseId, result])), envelope: previous };
}

async function commandScorer(models: EvalModels): Promise<void> {
  const k = Number(argValue("--k") ?? 3);
  const only = argList("--cases");
  const cases = loadScorerCases().filter((item) => !only || only.includes(item.id));
  if (!cases.length) throw new Error("没有评分器用例；先 npm run eval -- fixtures --scorer 40。");
  setAgentRunTag(`eval-scorer:${label()}`);
  const resumed = process.argv.includes("--resume") ? await completedScorerResults(k) : { done: new Map<string, ScorerCaseResult>(), envelope: null };
  const done = resumed.done;
  if (done.size) console.log(`续跑：复用 ${done.size} 道已完成用例。`);
  if (!process.argv.includes("--no-gate") && !done.size) await scorerSmokeGate(cases);
  const results: ScorerCaseResult[] = [];
  for (const item of cases) {
    const reused = done.get(item.id);
    if (reused) {
      results.push(reused);
      continue;
    }
    const runs = Object.fromEntries(SCORER_VARIANTS.map((variant) => [variant, [] as VariantRun[]])) as Record<ScorerVariant, VariantRun[]>;
    for (const variant of SCORER_VARIANTS) {
      for (let rep = 0; rep < k; rep += 1) {
        const startedAt = Date.now();
        try {
          const result = await evaluateMockInterviewQuestion({
            question: item.question,
            answer: item.answers[variant],
            rubric: item.rubric,
            expectedSignals: item.expectedSignals,
            jobTitle: item.jobTitle,
            jobDescription: item.jobDescription,
            thread: { kind: item.thread.kind, depth: item.thread.depth, probeCount: item.thread.probeCount, facets: item.thread.facets },
            round: item.round,
            competencies: [],
          });
          runs[variant].push({ score: result.score, evaluation: result.evaluation, metrics: result.metrics, durationMs: Date.now() - startedAt, totalTokens: null });
        } catch (error) {
          if (isBillingError(error)) throw error;
          console.warn(`${item.id}/${variant}#${rep + 1} 评分失败：`, error instanceof Error ? error.message : error);
        }
      }
    }
    results.push({ caseId: item.id, runs });
    console.log(`${item.id}: ${SCORER_VARIANTS.map((variant) => `${variant}=${runs[variant].map((run) => run.score).join("/") || "—"}`).join("  ")}`);
    await writeRun("scorer", { ...envelope("scorer", models, k, { evaluation: EVALUATION_PROMPT_VERSION }), partial: true, results });
  }
  const incomplete = results.filter((result) => SCORER_VARIANTS.some((variant) => result.runs[variant].length < k)).map((result) => result.caseId);
  if (incomplete.length) console.warn(`有 ${incomplete.length} 道用例评分次数不足（${incomplete.join(", ")}），用 --resume 补跑后再看指标。`);
  await flushAgentRunPersistence();
  const tokens = await prisma.agentRun.groupBy({ by: ["tag"], where: { tag: `eval-scorer:${label()}`, event: "model_call" }, _avg: { totalTokens: true } });
  const verdicts = cases.map((item, index) => judgeScorerCase(item, results[index]));
  const metrics = summarizeScorer(verdicts, results);
  metrics.tokensPerCall = tokens[0]?._avg.totalTokens ?? null;
  // 全部复用（纯重算指标）时保留原产物的时间、提交与模型信息，不改写来源。
  const reran = cases.some((item) => !done.has(item.id));
  const body = {
    ...(reran || !resumed.envelope ? envelope("scorer", models, k, { evaluation: EVALUATION_PROMPT_VERSION }) : resumed.envelope),
    metrics: flattenScorerMetrics(metrics),
    unstable: metrics.unstable,
    incomplete,
    results,
    cases: verdicts.map((verdict, index) => ({
      ...verdict,
      wrongClaim: cases[index].truth.wrongClaim,
      errWeaknesses: results[index].runs.err.map((run) => run.evaluation.weaknesses),
    })),
  };
  const file = await writeRun("scorer", body);
  console.log(`\n${renderMetricTable(scorerMetricRows(metrics))}\n\n产物：${file}`);
}

async function commandCompare(): Promise<void> {
  const [a, b] = process.argv.slice(3).filter((arg) => !arg.startsWith("--"));
  if (!a || !b) throw new Error("用法：eval compare a.json b.json");
  const [left, right] = await Promise.all([a, b].map(async (file) => JSON.parse(await fs.readFile(file, "utf8")) as { metrics: Record<string, MetricValue>; label: string; git: { commit: string; dirty: boolean } }));
  console.log(`A = ${left.label} (${left.git.commit}${left.git.dirty ? "+dirty" : ""})\nB = ${right.label} (${right.git.commit}${right.git.dirty ? "+dirty" : ""})\n`);
  console.log(compareMetrics(left.metrics, right.metrics));
}

/* -------------------------------------------------------------------- main */

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "compare") return commandCompare();
  installAgentRunPersistence();
  const models = await loadEvalModels();
  console.log(`主模型 ${models.main.provider}/${models.main.model}；aux ${models.aux.provider}/${models.aux.model}${models.auxSameFamily ? "（同家族）" : ""}`);
  switch (command) {
    case "fixtures":
      return commandFixtures(models);
    case "scorer":
      return commandScorer(models);
    case "coverage":
      return commandCoverage(models);
    default:
      throw new Error("用法：eval <fixtures | scorer | coverage | compare>（面试官评测见 npm run simulate）");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await flushAgentRunPersistence();
    await prisma.$disconnect();
  });

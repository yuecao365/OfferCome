import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { flushAgentRunPersistence, installAgentRunPersistence, setAgentRunTag } from "../src/lib/ai/agent-run-store";
import { prisma } from "../src/lib/db";
import { loadEvalModels, type EvalModels } from "../src/lib/evals/models";
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
  briefLadderRate,
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
  generatePersona,
  generateScorerCase,
  mergeRoleTopics,
  type FileTopic,
  type ScorerCaseSource,
} from "../src/lib/evals/generate";
import {
  findClaimTurn,
  flattenInterviewerMetrics,
  interviewerMetricRows,
  personaAssertions,
  scriptAssertions,
  sessionTrace,
  summarizeInterviewer,
  type SessionOutcome,
  type SessionSnapshot,
  type SnapshotThread,
} from "../src/lib/evals/interviewer-metrics";
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
import { evidenceTargetForPace, parseStoredBrief, type InterviewBrief } from "../src/lib/mock-interviews/interviewer/brief";
import { generateInterviewBrief } from "../src/lib/mock-interviews/interviewer/brief-agent";
import { INTERVIEWER_PROMPT_VERSION } from "../src/lib/mock-interviews/interviewer/prompt";
import { analyzeMockInterviewJob } from "../src/lib/mock-interviews/job-analysis-agent";
import { parseStoredMemory, type MemoryPatch } from "../src/lib/mock-interviews/interviewer/memory";
import { EVALUATION_PROMPT_VERSION, evaluateMockInterviewQuestion } from "../src/lib/mock-interviews/question-evaluation-agent";
import { parseStoredEvaluationList, type EvaluationStrength, type EvaluationWeakness } from "../src/lib/mock-interviews/question-evaluation";
import { parseStoredReport } from "../src/lib/mock-interviews/report";
import { buildStoredResumeName, RESUME_UPLOAD_DIR } from "../src/lib/resumes/storage";

/**
 * 评测运行器。必须用 react-server 条件跑，让 server-only 解析成空模块：
 *   npm run eval -- fixtures [--personas 3] [--scorer 40 [--from-sessions --eval-tag <tag>]] [--jd tencent-hunyuan-backend] [--mianjing]
 *   npm run eval -- scorer [--k 3] [--label name] [--cases a,b]
 *   npm run eval -- coverage [--k 2] [--label name] [--roles backend,infra]
 *   npm run eval -- interviewer [--k 1] [--label name] [--cases persona-1,hints] [--base http://localhost:3000]
 *   npm run eval -- interviewer --tag eval-interviewer:baseline-1 [--label name]   按标签重算（只重跑裁判与指标）
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
const RESUME_MIME = "text/markdown";

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

async function ensureEvalResume(resumeId: string): Promise<string> {
  const originalName = `eval-${resumeId}.md`;
  const existing = await prisma.resume.findFirst({ where: { originalName }, select: { id: true } });
  if (existing) return existing.id;
  const text = loadResumeText(resumeId);
  await fs.mkdir(RESUME_UPLOAD_DIR, { recursive: true });
  const storedName = buildStoredResumeName(".md");
  const filePath = path.join(RESUME_UPLOAD_DIR, storedName);
  await fs.writeFile(filePath, text, "utf8");
  const created = await prisma.resume.create({
    data: { originalName, storedName, filePath, mimeType: RESUME_MIME, fileSize: Buffer.byteLength(text), isDefault: false },
    select: { id: true },
  });
  console.log(`已为合成简历 ${resumeId} 建了 Resume 记录 ${created.id}`);
  return created.id;
}

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
    const brief = parseStoredBrief(question.interview.mockSession.briefJson);
    const area = brief?.areas.find((item) => item.id === metadata.areaId);
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
        depth: Number(metadata.depth ?? 0),
        targetDepth: area?.depth ?? Number(metadata.depth ?? 1),
        probeCount: Number(metadata.probeCount ?? 0),
        rescues: Number(metadata.rescues ?? 0),
        note: typeof metadata.note === "string" ? metadata.note : null,
      },
    });
    if (sources.length >= limit) break;
  }
  return sources;
}

/**
 * 评分器用例的题目来源：按 eval/coverage.json 的 5 岗位 × 2 份 JD 各备一次课（深入节奏），
 * 每个非项目领域出一道题（切入问题 + 阶梯当追问）。题目跨五个方向，错句才有得选；
 * 只用评测面试的题目时全在一份简历的两个项目上打转，错句十道雷同。
 */
async function scorerSourcesFromBriefs(resumeId: string, existing: Set<string>, limit: number): Promise<(ScorerCaseSource & { role: string })[]> {
  const config = loadCoverageConfig();
  const perRole: Record<string, (ScorerCaseSource & { role: string })[]> = {};
  for (const [role, jdIds] of Object.entries(config.roles)) {
    perRole[role] = [];
    for (const jdId of jdIds ?? []) {
      const jd = loadJdFixture(jdId);
      const brief = await generateEvalBrief(jdId, resumeId, "scorer-source");
      for (const area of brief.areas) {
        if (area.kind === "project") continue;
        const questionId = `${jdId}:${area.id}`;
        if (existing.has(questionId)) continue;
        perRole[role].push({
          id: `${jdId.replace(/[^a-z0-9-]/g, "")}-${area.id.toLowerCase().replace(/[^a-z0-9-]/g, "")}`,
          questionId,
          role,
          jobTitle: jd.title,
          jobDescription: jd.jobDescription,
          round: "first_interview",
          question: [area.entryQuestion.trim(), ...area.ladder.map((rung, index) => `追问 ${index + 1}：${rung.text.trim()}`)].join("\n"),
          rubric: area.rubric,
          expectedSignals: area.expectedSignals,
          thread: { depth: area.ladder.length, targetDepth: area.depth, probeCount: area.ladder.length, rescues: 0, note: null },
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

async function commandFixtures(models: EvalModels): Promise<void> {
  const jdId = argValue("--jd") ?? "tencent-hunyuan-backend";
  const resumeId = argValue("--resume") ?? "synthetic-backend";
  const personaCount = Number(argValue("--personas") ?? 0);
  const scorerCount = Number(argValue("--scorer") ?? 0);
  const mianjing = process.argv.includes("--mianjing");
  if (!personaCount && !scorerCount && !mianjing) throw new Error("指定 --personas N、--scorer N 或 --mianjing。");
  if (mianjing) await buildTopics(models);
  const jd = loadJdFixture(jdId);
  const resumeText = loadResumeText(resumeId);
  void resumeText;

  if (personaCount) {
    // 弱项话题要落在备课会考察的领域里，先备一次课拿领域清单（深入节奏，看全貌）。
    const reference = await generateEvalBrief(jdId, resumeId, "persona-reference");
    const areas = reference.areas.filter((area) => area.kind !== "project").map((area) => ({ name: area.name, description: area.description, ladder: area.ladder.map((rung) => rung.text) }));
    console.log(`参考简报领域：${areas.map((area) => area.name).join("；")}`);
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
      : await scorerSourcesFromBriefs(resumeId, existing, scorerCount);
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
      history: [],
      profile: { revision: 0, insights: [] },
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

/** 校准样本要和真实样本同一形状：把一道面经原题包成一个简报领域。 */
function asBriefArea(question: string): string {
  return `【考察领域】围绕这道题展开。切入问题：${question}。追问阶梯：1. 追问它的原理；2. 追问它在真实场景里的取舍`;
}

async function commandCoverage(models: EvalModels): Promise<void> {
  const k = Number(argValue("--k") ?? 1);
  const only = argList("--roles");
  const topicsFile = loadTopics();
  const config = loadCoverageConfig();
  const roles = COVERAGE_ROLES.filter((role) => (!only || only.includes(role)) && topicsFile.roles[role] && config.roles[role]);
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

  const briefs: (BriefCoverage & { areas: string[] })[] = [];
  for (const role of roles) {
    const topics = topicsFile.roles[role]!.topics;
    for (const jdId of config.roles[role]!) {
      for (let rep = 1; rep <= k; rep += 1) {
        console.log(`\n=== ${role} / ${jdId} #${rep}`);
        try {
          const brief = await generateEvalBrief(jdId, config.resume, label());
          const text = briefCoverageText(brief);
          const verdicts = await judgeMany(models.aux, "topic", topics.map((topic) => ({ a: topicText(topic), b: text })));
          const covered = Object.fromEntries(topics.map((topic, index) => [topic.id, calibration.trusted ? verdicts[index] : null]));
          const areas = brief.areas.map((area) => `${area.name}（${area.kind}${area.baseline ? "，基线" : ""}）`);
          briefs.push({
            role,
            jd: jdId,
            rep,
            covered,
            ladderProgressRate: briefLadderRate(brief),
            areaCount: brief.areas.length,
            baselineAreaCount: brief.areas.filter((area) => area.baseline).length,
            skillPacks: brief.skillPacks,
            areas,
          });
          console.log(`  领域：${areas.join("；")}\n  技能包：${brief.skillPacks.join(", ") || "无"}；覆盖 ${Object.values(covered).filter(Boolean).length}/${topics.length}`);
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
    ...envelope("coverage", models, k, { blueprint: "job_blueprint", brief: INTERVIEWER_PROMPT_VERSION }),
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
        thread: item.thread,
        round: item.round,
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

async function commandScorer(models: EvalModels): Promise<void> {
  const k = Number(argValue("--k") ?? 3);
  const only = argList("--cases");
  const cases = loadScorerCases().filter((item) => !only || only.includes(item.id));
  if (!cases.length) throw new Error("没有评分器用例；先 npm run eval -- fixtures --scorer 40。");
  setAgentRunTag(`eval-scorer:${label()}`);
  if (!process.argv.includes("--no-gate")) await scorerSmokeGate(cases);
  const results: ScorerCaseResult[] = [];
  for (const item of cases) {
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
            thread: item.thread,
            round: item.round,
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
  }
  await flushAgentRunPersistence();
  const tokens = await prisma.agentRun.groupBy({ by: ["tag"], where: { tag: `eval-scorer:${label()}`, event: "model_call" }, _avg: { totalTokens: true } });
  const verdicts = cases.map((item, index) => judgeScorerCase(item, results[index]));
  const metrics = summarizeScorer(verdicts, results);
  metrics.tokensPerCall = tokens[0]?._avg.totalTokens ?? null;
  const body = {
    ...envelope("scorer", models, k, { evaluation: EVALUATION_PROMPT_VERSION }),
    metrics: flattenScorerMetrics(metrics),
    unstable: metrics.unstable,
    cases: verdicts.map((verdict, index) => ({
      ...verdict,
      wrongClaim: cases[index].truth.wrongClaim,
      errWeaknesses: results[index].runs.err.map((run) => run.evaluation.weaknesses),
    })),
  };
  const file = await writeRun("scorer", body);
  console.log(`\n${renderMetricTable(scorerMetricRows(metrics))}\n\n产物：${file}`);
}

/* ------------------------------------------------------------- interviewer */

type TurnData = { messages: { kind: string; content: string; turnIndex: number }[]; phase: string | null; effects: string[]; replay: boolean };

async function postTurn(base: string, sessionId: string, body: Record<string, unknown>): Promise<{ data: TurnData; latencyMs: number }> {
  const startedAt = Date.now();
  const response = await fetch(`${base}/api/interviews/mock/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, messages: [] }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`turn ${response.status}: ${text.slice(0, 200)}`);
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const chunk = JSON.parse(line.slice(6)) as { type?: string; data?: TurnData };
      if (chunk.type === "data-turn" && chunk.data) return { data: chunk.data, latencyMs: Date.now() - startedAt };
    } catch {}
  }
  throw new Error(`回合没有返回 data-turn：${text.slice(-300)}`);
}

async function pollStatus(base: string, sessionId: string, done: (status: string) => boolean, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let status = "";
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/interviews/mock/${sessionId}/status`);
    const json = (await response.json()) as { status: string; error?: string | null };
    status = json.status;
    if (json.status === "failed") throw new Error(`备课失败：${json.error ?? ""}`);
    if (done(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return status;
}

type EvalCase = { id: string; kind: "persona" | "script"; persona?: Persona; script?: CandidateScript; jd: string; resume: string };

/** 会话的公司名记用例与序号（"评测 persona-1 #2"），按标签重算时靠它认出用例。 */
function sessionLabel(caseId: string, rep: number): string {
  return `评测 ${caseId} #${rep}`;
}

function parseSessionLabel(companyName: string): { caseId: string; rep: number } | null {
  const match = companyName.match(/^评测 ([a-z0-9-]+) #(\d+)$/);
  return match ? { caseId: match[1], rep: Number(match[2]) } : null;
}

async function createSession(base: string, item: EvalCase, resumeDbId: string, tag: string, rep: number): Promise<string> {
  const jd = loadJdFixture(item.jd);
  const form = new FormData();
  form.set("companyName", sessionLabel(item.id, rep));
  form.set("jobTitle", jd.title);
  form.set("resumeId", resumeDbId);
  form.set("pace", "quick");
  form.set("round", "first_interview");
  form.set("jobDescriptionText", jd.jobDescription);
  const response = await fetch(`${base}/api/interviews/mock`, { method: "POST", body: form });
  const json = (await response.json()) as { id?: string; interviewId?: string; error?: string };
  if (!response.ok || !json.id || !json.interviewId) throw new Error(`创建会话失败：${json.error ?? response.status}`);
  await prisma.interview.update({ where: { id: json.interviewId }, data: { evalTag: tag } });
  return json.id;
}

/** 静态脚本的消息迭代器：展开 repeat，耗尽后轮流发 filler。 */
function* scriptMessages(script: CandidateScript): Generator<{ content?: string; intent?: string }> {
  yield { content: script.intro };
  for (const message of script.messages) {
    for (let i = 0; i < (message.repeat ?? 1); i += 1) yield message;
  }
  let index = 0;
  while (true) yield { content: script.filler[index++ % script.filler.length] };
}

async function driveSession(base: string, item: EvalCase, sessionId: string, models: EvalModels, resumeText: string, jobTitle: string) {
  const latency: number[] = [];
  const transcript: TranscriptLine[] = [];
  let endedBy: SessionSnapshot["endedBy"] = null;
  const start = await postTurn(base, sessionId, { kind: "start" });
  latency[0] = start.latencyMs;
  for (const message of start.data.messages) transcript.push({ role: "interviewer", content: message.content });
  const script = item.script ? scriptMessages(item.script) : null;
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    let body: Record<string, unknown>;
    if (script) {
      const next = script.next().value as { content?: string; intent?: string };
      body = { clientId: `eval-${turn}`, content: next.content ?? "", intent: next.intent };
    } else {
      const claim = item.persona!.weak?.wrongClaim ?? null;
      const saidClaim = claim ? transcript.some((line) => line.role === "candidate" && line.content.includes(claim.replace(/[。！？]$/, ""))) : true;
      const forceWrongClaim = Boolean(claim) && !saidClaim && turn >= FORCE_CLAIM_AFTER_TURN;
      const simulate = () =>
        simulateCandidateReply(models.aux, { persona: item.persona!, resumeText, jobTitle, transcript, forceWrongClaim, runId: `eval-sim:${sessionId}:${turn}` });
      // 兼容通道的模型偶尔返回坏 JSON，抢救不了就再要一次；再失败才算这场失败。
      const reply = await simulate().catch(() => simulate());
      const stillMissing = claim && !saidClaim && !reply.reply.includes(claim.replace(/[。！？]$/, ""));
      const content = stillMissing && turn >= APPEND_CLAIM_AFTER_TURN ? `${reply.reply.trim()}\n\n另外我想补充一点：${claim}` : reply.reply;
      body = { clientId: `eval-${turn}`, content };
    }
    if (typeof body.content === "string" && body.content) transcript.push({ role: "candidate", content: body.content });
    const result = await postTurn(base, sessionId, body);
    latency[turn] = result.latencyMs;
    for (const message of result.data.messages) transcript.push({ role: "interviewer", content: message.content });
    const last = result.data.messages.at(-1);
    console.log(`  turn ${turn} ${result.data.phase} ${result.data.messages.map((message) => message.kind).join(",")} ${result.data.effects.join(",")}  > ${(last?.content ?? "").slice(0, 60).replace(/\n/g, " ")}`);
    if (result.data.phase === "ended") {
      endedBy = body.intent === "end" ? "candidate" : "interviewer";
      break;
    }
  }
  if (!endedBy) {
    await postTurn(base, sessionId, { clientId: "eval-hardstop", content: "", intent: "end" });
    endedBy = "hardstop";
  }
  return { latency, endedBy };
}

function toEvaluation(row: NonNullable<Awaited<ReturnType<typeof loadSessionForSnapshot>>>["interview"]["questions"][number]["evaluation"]) {
  if (!row || row.evaluationStatus !== "completed") return null;
  return {
    dimensions: (parseJsonValue(row.dimensionsJson) as { name: string; score: number; evidence: string; gap?: string | null }[] | null ?? []).map((item) => ({ ...item, gap: item.gap ?? null })),
    strengths: parseStoredEvaluationList<EvaluationStrength>(parseJsonValue(row.strengthsJson), (point) => ({ point, quote: null })),
    weaknesses: parseStoredEvaluationList<EvaluationWeakness>(parseJsonValue(row.weaknessesJson), (point) => ({ point, quote: null, kind: "missing" })),
    advice: (parseJsonValue(row.adviceJson) as string[] | null) ?? [],
    feedback: row.feedback ?? "",
  };
}

function loadSessionForSnapshot(sessionId: string) {
  return prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interview: { include: { questions: { include: { evaluation: true } } } },
      messages: { orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }] },
      threads: { orderBy: { createdAt: "asc" } },
      decisions: { orderBy: { turnIndex: "asc" } },
    },
  });
}

async function loadSnapshot(sessionId: string, item: EvalCase, rep: number, drive: { latency: number[]; endedBy: SessionSnapshot["endedBy"]; error: string | null }): Promise<SessionSnapshot> {
  const session = await loadSessionForSnapshot(sessionId);
  if (!session) throw new Error(`会话 ${sessionId} 不存在`);
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) throw new Error(`会话 ${sessionId} 没有简报`);
  const runs = await prisma.agentRun.findMany({
    where: { runId: { startsWith: `turn:${sessionId}:` }, event: "model_call" },
    select: { runId: true, durationMs: true, totalTokens: true },
  });
  const questionById = new Map(session.interview.questions.map((question) => [question.id, question]));
  const threads: SnapshotThread[] = session.threads.map((thread) => {
    const question = thread.questionId ? questionById.get(thread.questionId) : null;
    return {
      id: thread.id,
      areaId: thread.areaId,
      entryQuestion: thread.entryQuestion,
      status: thread.status as SnapshotThread["status"],
      depth: thread.depth,
      rescues: thread.rescues,
      clarifies: thread.clarifies,
      interrupts: thread.interrupts,
      openedAtTurn: thread.openedAtTurn,
      closedAtTurn: thread.closedAtTurn,
      note: thread.note,
      questionId: thread.questionId,
      score: question?.evaluation?.score ?? null,
      evaluation: question ? toEvaluation(question.evaluation) : null,
      answer: question?.answer ?? null,
    };
  });
  return {
    sessionId,
    caseId: item.id,
    caseKind: item.kind,
    rep,
    status: session.status,
    pace: brief.pace,
    evidenceTarget: evidenceTargetForPace(brief.pace),
    areas: brief.areas.map((area) => ({ id: area.id, name: area.name, depth: area.depth, weight: area.weight })),
    hypotheses: brief.hypotheses,
    memory: parseStoredMemory(session.memoryJson, brief),
    messages: session.messages.map((message) => ({
      turnIndex: message.turnIndex,
      role: message.role as "interviewer" | "candidate",
      kind: message.kind as SessionSnapshot["messages"][number]["kind"],
      content: message.content,
      threadId: message.threadId,
    })),
    threads,
    decisions: session.decisions.map((decision) => ({
      turnIndex: decision.turnIndex,
      proposedAction: decision.proposedAction,
      appliedAction: decision.appliedAction,
      followUp: decision.followUp,
      replacedReason: decision.replacedReason,
      anchorHit: decision.anchorHit,
      memoryPatch: (parseJsonValue(decision.memoryPatchJson) as MemoryPatch | null) ?? null,
      evidenceBefore: decision.evidenceBefore,
      evidenceAfter: decision.evidenceAfter,
      skillsLoaded: decision.skillsLoaded,
    })),
    report: parseStoredReport(session.reportJson),
    runs: runs.map((run) => ({ turnIndex: Number(run.runId.split(":").pop()), durationMs: run.durationMs, totalTokens: run.totalTokens })),
    endedBy: drive.endedBy,
    error: drive.error,
    judged: { related: {}, pushback: null },
    turnLatencyMs: drive.latency,
  };
}

/** 追问贴合的裁判样本：每条 probe 与它之前最近的候选人回答。 */
function relatedItems(snapshot: SessionSnapshot): { turnIndex: number; item: JudgeItem }[] {
  const items: { turnIndex: number; item: JudgeItem }[] = [];
  let lastAnswer: string | null = null;
  for (const message of snapshot.messages) {
    if (message.role === "candidate" && message.kind === "answer") lastAnswer = message.content;
    if (message.role === "interviewer" && (message.kind === "probe" || message.kind === "interrupt") && lastAnswer) {
      items.push({ turnIndex: message.turnIndex, item: { a: lastAnswer, b: message.content } });
    }
  }
  return items;
}

/** 纠偏的裁判样本：错句所在回合面试官的回应。 */
function pushbackItem(snapshot: SessionSnapshot, persona: Persona): JudgeItem | null {
  if (!persona.weak) return null;
  const claim = findClaimTurn(snapshot, persona.weak.wrongClaim);
  if (!claim) return null;
  const reply = snapshot.messages
    .filter((message) => message.role === "interviewer" && message.turnIndex === claim.turnIndex)
    .map((message) => message.content)
    .join("\n");
  return reply ? { a: persona.weak.wrongClaim, b: reply } : null;
}

async function judgeSnapshots(models: EvalModels, cases: Map<string, EvalCase>, snapshots: SessionSnapshot[]) {
  const related = snapshots.flatMap((snapshot) => relatedItems(snapshot).map((entry) => ({ snapshot, ...entry })));
  const pushback = snapshots.flatMap((snapshot) => {
    const persona = cases.get(snapshot.caseId)?.persona;
    const item = persona ? pushbackItem(snapshot, persona) : null;
    return item ? [{ snapshot, item }] : [];
  });
  const answers = [...new Set(related.map((entry) => entry.item.a))].slice(0, 30);
  const claims = pushback.map((entry) => entry.item.a);
  const neutral = snapshots
    .flatMap((snapshot) => {
      const persona = cases.get(snapshot.caseId)?.persona;
      const claimTurn = persona?.weak ? findClaimTurn(snapshot, persona.weak.wrongClaim)?.turnIndex : null;
      return snapshot.messages.filter((message) => message.role === "interviewer" && message.kind === "probe" && message.turnIndex !== claimTurn).map((message) => message.content);
    })
    .slice(0, 20);
  console.log(`裁判校准：related ${answers.length} 条，pushback ${claims.length} 条`);
  const calibrations: JudgeCalibration[] = [];
  if (answers.length >= 5) calibrations.push(await calibrateJudge(models.aux, "related", answers));
  if (claims.length >= 1 && neutral.length >= 1) calibrations.push(await calibrateJudge(models.aux, "pushback", [...new Set(claims)].concat(answers.slice(0, Math.max(0, 10 - claims.length))), neutral));
  const trusted = { related: calibrations.find((c) => c.kind === "related")?.trusted ?? false, pushback: calibrations.find((c) => c.kind === "pushback")?.trusted ?? false };
  const relatedVerdicts = await judgeMany(models.aux, "related", related.map((entry) => entry.item));
  related.forEach((entry, index) => {
    entry.snapshot.judged.related[entry.turnIndex] = relatedVerdicts[index];
  });
  const pushbackVerdicts = await judgeMany(models.aux, "pushback", pushback.map((entry) => entry.item));
  pushback.forEach((entry, index) => {
    entry.snapshot.judged.pushback = pushbackVerdicts[index];
  });
  return { calibrations, trusted };
}

async function commandInterviewer(models: EvalModels): Promise<void> {
  const base = argValue("--base") ?? DEFAULT_BASE;
  const k = Number(argValue("--k") ?? 1);
  const only = argList("--cases");
  const reuse = argList("--session");
  const reuseTag = argValue("--tag");
  const cases = new Map<string, EvalCase>();
  for (const persona of loadPersonas()) cases.set(persona.id, { id: persona.id, kind: "persona", persona, jd: persona.jd, resume: persona.resume });
  for (const script of loadCandidateScripts()) cases.set(script.id, { id: script.id, kind: "script", script, jd: script.jd, resume: script.resume });
  const selected = [...cases.values()].filter((item) => !only || only.includes(item.id));
  if (!selected.length) throw new Error("没有匹配的用例。");
  const tag = reuseTag ?? `eval-interviewer:${label()}`;
  const snapshots: SessionSnapshot[] = [];

  if (reuseTag) {
    // 按标签重算：不调面试模型，只重跑裁判与指标。用例从会话名里认，认不出的跳过。
    const rows = await prisma.mockInterviewSession.findMany({
      where: { interview: { evalTag: reuseTag } },
      orderBy: { createdAt: "asc" },
      select: { id: true, interview: { select: { companyName: true } } },
    });
    for (const row of rows) {
      const parsed = parseSessionLabel(row.interview.companyName);
      const item = parsed ? cases.get(parsed.caseId) : undefined;
      if (!parsed || !item || (only && !only.includes(item.id))) continue;
      snapshots.push(await loadSnapshot(row.id, item, parsed.rep, { latency: [], endedBy: null, error: null }));
    }
    if (!snapshots.length) throw new Error(`标签 ${reuseTag} 下没有能认出用例的会话。`);
    console.log(`按标签重算 ${snapshots.length} 场`);
  } else if (reuse) {
    for (const [index, sessionId] of reuse.entries()) {
      const item = selected[index % selected.length];
      snapshots.push(await loadSnapshot(sessionId, item, 1, { latency: [], endedBy: null, error: null }));
    }
  } else {
    await fetch(`${base}/api/interviews/mock/none/status`).catch(() => {
      throw new Error(`连不上 ${base}；先启动 dev 服务器。`);
    });
    for (const item of selected) {
      const resumeDbId = await ensureEvalResume(item.resume);
      const resumeText = loadResumeText(item.resume);
      const jobTitle = loadJdFixture(item.jd).title;
      for (let rep = 1; rep <= k; rep += 1) {
        console.log(`\n=== ${item.id} #${rep}`);
        let sessionId: string | null = null;
        try {
          sessionId = await createSession(base, item, resumeDbId, tag, rep);
          const status = await pollStatus(base, sessionId, (value) => value !== "generating", 180_000);
          if (status !== "in_progress") throw new Error(`备课后状态是 ${status}`);
          const drive = await driveSession(base, item, sessionId, models, resumeText, jobTitle);
          const final = await pollStatus(base, sessionId, (value) => value === "completed", 150_000);
          if (final !== "completed") console.warn(`  报告没有在时限内生成，状态 ${final}`);
          snapshots.push(await loadSnapshot(sessionId, item, rep, { ...drive, error: null }));
        } catch (error) {
          if (isBillingError(error)) throw error;
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`  失败：${message}`);
          if (sessionId) {
            snapshots.push(await loadSnapshot(sessionId, item, rep, { latency: [], endedBy: "error", error: message }).catch(() => emptySnapshot(sessionId!, item, rep, message)));
          } else {
            snapshots.push(emptySnapshot("", item, rep, message));
          }
        }
      }
    }
  }

  const judged = await judgeSnapshots(models, cases, snapshots.filter((snapshot) => snapshot.error === null));
  await flushAgentRunPersistence();
  const outcomes: SessionOutcome[] = snapshots.map((snapshot) => {
    const item = cases.get(snapshot.caseId)!;
    const trace = sessionTrace(snapshot);
    if (snapshot.error) return { snapshot, trace, valid: false, assertions: [] };
    if (item.kind === "persona") {
      const result = personaAssertions(snapshot, item.persona!);
      return { snapshot, trace, valid: result.valid, assertions: result.assertions };
    }
    return { snapshot, trace, valid: true, assertions: scriptAssertions(snapshot, item.script!) };
  });
  const metrics = summarizeInterviewer(outcomes);
  const body = {
    ...envelope("interviewer", models, k, { interviewer: "interviewer-v4", evaluation: EVALUATION_PROMPT_VERSION }),
    tag,
    judges: judged.calibrations,
    metrics: flattenInterviewerMetrics(metrics) as Record<string, MetricValue>,
    sessions: outcomes.map((outcome) => ({
      sessionId: outcome.snapshot.sessionId,
      caseId: outcome.snapshot.caseId,
      rep: outcome.snapshot.rep,
      status: outcome.snapshot.status,
      endedBy: outcome.snapshot.endedBy,
      error: outcome.snapshot.error,
      valid: outcome.valid,
      trace: outcome.trace,
      assertions: outcome.assertions,
      turns: outcome.snapshot.decisions.map((decision) => ({
        turnIndex: decision.turnIndex,
        proposed: decision.proposedAction,
        applied: decision.appliedAction,
        replaced: decision.replacedReason,
        anchorHit: decision.anchorHit,
        related: outcome.snapshot.judged.related[decision.turnIndex] ?? null,
        evidence: [decision.evidenceBefore, decision.evidenceAfter],
      })),
    })),
  };
  const file = await writeRun("interviewer", body);
  const judgeLines = judged.calibrations.map((c) => `- 裁判 ${c.kind}：准确率 ${c.accuracy.value?.toFixed(2) ?? "—"} (${c.accuracy.numerator}/${c.accuracy.denominator})${c.trusted ? "" : "，不可信"}`);
  const failed = outcomes.flatMap((outcome) => outcome.assertions.filter((item) => item.pass === false).map((item) => `- ${outcome.snapshot.caseId}#${outcome.snapshot.rep} ${item.name}：${item.detail}`));
  console.log(`\n${judgeLines.join("\n")}\n\n${renderMetricTable(interviewerMetricRows(metrics, judged.trusted))}\n\n未通过的断言：\n${failed.join("\n") || "（无）"}\n\n产物：${file}`);
}

function emptySnapshot(sessionId: string, item: EvalCase, rep: number, error: string): SessionSnapshot {
  return {
    sessionId,
    caseId: item.id,
    caseKind: item.kind,
    rep,
    status: "error",
    pace: "quick",
    evidenceTarget: 0,
    areas: [],
    hypotheses: [],
    memory: { established: [], doubtful: [], failed: [], hypotheses: [] },
    messages: [],
    threads: [],
    decisions: [],
    report: null,
    runs: [],
    endedBy: "error",
    error,
    judged: { related: {}, pushback: null },
    turnLatencyMs: [],
  };
}

/* ----------------------------------------------------------------- compare */

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
    case "interviewer":
      return commandInterviewer(models);
    case "coverage":
      return commandCoverage(models);
    default:
      throw new Error("用法：eval <fixtures | scorer | interviewer | coverage | compare>");
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

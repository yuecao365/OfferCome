import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { AI_TASKS, validateAiTaskConfig, type AiTaskConfig } from "../src/lib/ai/config";
import { flushAgentRunPersistence, installAgentRunPersistence, setAgentRunTag } from "../src/lib/ai/agent-run-store";
import { runAgent } from "../src/lib/ai/run-agent";
import { modelFamily, parseAuxConfig } from "../src/lib/evals/models";
import { salvageJson } from "../src/lib/ai/salvage-json";
import { textsOverlap } from "../src/lib/evals/metamorphic";
import { getAiTaskConfig } from "../src/lib/settings/ai";

/**
 * InterviewBench 子任务层运行器（docs/interviewbench-plan.md §2.1）。
 * 每个子任务 = eval/bench/subtasks/<task>.json 里的一批题 + 一个提示词 + 一个打分函数；被测的是"一个模型当面试官的基本功"，
 * 与本项目的面试流程无关，任何模型都能跑。真值来源见各题文件的 description。
 *
 *   npm run bench -- --tasks s1,s1b,s2,s4,s5,s6 --models main --limit 5 --label smoke
 *   npm run bench -- --tasks s3 --models main --label s3-main            # 只生成下一问，写到 labels/ 等人工判
 *   其他模型：--models main,openai:gpt-5.4-mini（借设置页里该服务商的 key）或 BENCH_MODEL_<name> 环境变量（完整 JSON 配置）
 *
 * 产物：eval/bench/runs/<label>-<task>-<model>.json；终端印一张表。
 */

const BENCH_DIR = path.join(process.cwd(), "eval", "bench");
const RUNS_DIR = path.join(BENCH_DIR, "runs");
const LABELS_DIR = path.join(BENCH_DIR, "labels");

type Args = Record<string, string | true>;
function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[item.slice(2)] = true;
    else {
      args[item.slice(2)] = next;
      index += 1;
    }
  }
  return args;
}
const text = (args: Args, key: string, fallback: string): string => (typeof args[key] === "string" ? (args[key] as string) : fallback);
/** 文件名里不能有冒号（Windows 会把它当 NTFS 备用数据流，目录里显示 0 字节）。 */
const safeName = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/g, "-");

type Item = { id: string } & Record<string, unknown>;
type TaskFile = { task: string; description: string; rubric?: Record<string, Record<string, string>>; archetypes?: Record<string, Record<string, string>>; items: Item[] };

function loadTask(name: string): TaskFile {
  const file = fs.readdirSync(path.join(BENCH_DIR, "subtasks")).find((f) => f.startsWith(`${name}-`) || f === `${name}.json`);
  if (!file) throw new Error(`没有子任务 ${name}`);
  return JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "subtasks", file), "utf8")) as TaskFile;
}

/**
 * 模型名三种写法：main = 设置页的文本模型；provider:model（如 openai:gpt-5.4-mini）= 借用设置页里同一服务商已存的 key 换个模型；
 * 其他名字 = 环境变量 BENCH_MODEL_<name> 里的完整 JSON 配置。
 */
async function loadModels(names: string[]): Promise<Record<string, AiTaskConfig>> {
  const out: Record<string, AiTaskConfig> = {};
  const stored = await Promise.all(AI_TASKS.map((task) => getAiTaskConfig(task)));
  for (const name of names) {
    if (name === "main") {
      out.main = await getAiTaskConfig("text");
      continue;
    }
    const spec = name.match(/^([a-z]+):(.+)$/);
    if (spec) {
      const [, provider, model] = spec;
      const donor = stored.find((c) => c.provider === provider && c.apiKey);
      if (!donor) throw new Error(`设置页里没有 ${provider} 的 key，无法跑 ${name}`);
      const validated = validateAiTaskConfig({ ...donor, task: "text", model }, donor.apiKey, true);
      if (!validated.ok) throw new Error(`模型 ${name} 配置不合法：${validated.message}`);
      out[name] = validated.value;
      continue;
    }
    const config = parseAuxConfig(process.env[`BENCH_MODEL_${name}`]);
    if (!config) throw new Error(`环境变量 BENCH_MODEL_${name} 没配或不合法`);
    out[name] = config;
  }
  return out;
}

/** 每题一次结构化调用；agent 名以 bench_ 开头，记账与生产分开。 */
async function ask<T>(config: AiTaskConfig, task: string, id: string, system: string, payload: unknown, schema: z.ZodType<T>, maxOutputTokens = 1_200): Promise<{ output: T | null; cost: number; error: string | null }> {
  try {
    const result = await runAgent({
      agent: `bench_${task}`,
      runId: `bench:${task}:${id}`,
      config,
      feature: "InterviewBench",
      promptVersion: "bench-v1",
      system,
      untrustedInputs: "简历、题目、对话与回答",
      payload,
      schema,
      maxOutputTokens,
      timeoutMs: 90_000,
      rescue: salvageJson(schema),
    });
    return { output: result.output, cost: costOf(result), error: null };
  } catch (error) {
    return { output: null, cost: 0, error: error instanceof Error ? error.message.slice(0, 200) : String(error) };
  }
}
function costOf(result: { events: { type: string }[] }): number {
  // 记账表里有精确成本；这里只粗算给终端看，按事件数近似不了，返回 0 交给 harness-report。
  void result;
  return 0;
}

const LEVELS = ["low", "medium", "high"] as const;
type Level = (typeof LEVELS)[number];
const levelIndex = (level: string) => LEVELS.indexOf(level as Level);

const rubricText = (rubric: Record<string, Record<string, string>>) => Object.entries(rubric).map(([dim, anchors]) => `- ${dim}: low = ${anchors.low} | medium = ${anchors.medium} | high = ${anchors.high}`).join("\n");

/** 二分类汇总：准确率、平衡准确率、正类精确率 / 召回。 */
function binary(rows: { truth: boolean; pred: boolean | null }[]) {
  const judged = rows.filter((r) => r.pred !== null);
  const tp = judged.filter((r) => r.truth && r.pred).length;
  const tn = judged.filter((r) => !r.truth && !r.pred).length;
  const fp = judged.filter((r) => !r.truth && r.pred).length;
  const fn = judged.filter((r) => r.truth && !r.pred).length;
  const tpr = tp + fn ? tp / (tp + fn) : 0;
  const tnr = tn + fp ? tn / (tn + fp) : 0;
  return { n: rows.length, answered: judged.length, accuracy: judged.length ? (tp + tn) / judged.length : 0, balancedAccuracy: (tpr + tnr) / 2, precision: tp + fp ? tp / (tp + fp) : 0, recall: tpr };
}

/** 三档序数的二次加权 κ。 */
function weightedKappa(pairs: [number, number][]): number | null {
  if (pairs.length === 0) return null;
  const k = LEVELS.length;
  const o = Array.from({ length: k }, () => Array(k).fill(0) as number[]);
  for (const [a, b] of pairs) o[a][b] += 1;
  const n = pairs.length;
  const rowSum = o.map((r) => r.reduce((s, v) => s + v, 0));
  const colSum = o[0].map((_, j) => o.reduce((s, r) => s + r[j], 0));
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i += 1)
    for (let j = 0; j < k; j += 1) {
      const w = ((i - j) ** 2) / ((k - 1) ** 2);
      num += w * o[i][j];
      den += (w * rowSum[i] * colSum[j]) / n;
    }
  return den === 0 ? null : 1 - num / den;
}

type TaskResult = { task: string; model: string; metrics: Record<string, number | null>; rows: unknown[]; failures: number };

// ------------------------------------------------------------------ 子任务

const TASKS: Record<string, (file: TaskFile, items: Item[], config: AiTaskConfig, label: string, modelName: string) => Promise<TaskResult>> = {
  // S1 判对错（中文）
  async s1(file, items, config, _label, model) {
    const schema = z.object({ hasError: z.boolean(), wrongClaim: z.string().max(200).nullable().describe("有错时逐字摘出那句；没有 null"), reason: z.string().max(200) });
    const system = "你是资深技术面试官。看一段面试问答，判断候选人的回答里有没有技术上站不住的具体陈述（概念、机制、边界说错）。笼统、不严谨、缺细节不算错。有错就把那句原样摘出来。只输出 JSON。";
    const rows = [];
    let failures = 0;
    for (const item of items) {
      const r = await ask(config, "s1", item.id, system, { question: item.question, answer: item.answer }, schema);
      if (!r.output) failures += 1;
      const truth = (item.truth as { hasError: boolean }).hasError;
      rows.push({ id: item.id, truth, pred: r.output?.hasError ?? null, wrongClaim: r.output?.wrongClaim ?? null, error: r.error });
    }
    const b = binary(rows.map((r) => ({ truth: r.truth, pred: r.pred })));
    return { task: "s1", model, metrics: { ...b }, rows, failures };
  },
  // S1b 识空话（英文 ML）
  async s1b(file, items, config, _label, model) {
    const schema = z.object({ hasEvidence: z.boolean(), reason: z.string().max(200) });
    const system = `You are a senior interviewer for an ML engineering role. Given one interviewer question and the applicant's answer, decide whether the answer provides substantive evidence about the applicant's actual knowledge, skills or abilities on the rubric below. Flattery, irrelevant chit-chat, and mere repetition of already-known resume facts are NOT evidence. Output JSON only.\n\nRubric:\n${rubricText(file.rubric ?? {})}`;
    const rows = [];
    let failures = 0;
    for (const item of items) {
      const r = await ask(config, "s1b", item.id, system, { question: item.question, answer: item.answer }, schema);
      if (!r.output) failures += 1;
      rows.push({ id: item.id, class: item.class, truth: (item.truth as { hasEvidence: boolean }).hasEvidence, pred: r.output?.hasEvidence ?? null, error: r.error });
    }
    const b = binary(rows.map((r) => ({ truth: r.truth, pred: r.pred })));
    return { task: "s1b", model, metrics: { ...b }, rows, failures };
  },
  // S2 定位错句（中文）
  async s2(file, items, config, _label, model) {
    const schema = z.object({ wrongClaim: z.string().min(1).max(200).describe("逐字摘自回答"), whyWrong: z.string().max(300) });
    const system = "你是资深技术面试官。这段回答里有一句技术上站不住的具体陈述，把它原样摘出来（逐字，不改写、不总结），并说为什么错。只输出 JSON。";
    const rows = [];
    let failures = 0;
    for (const item of items) {
      const r = await ask(config, "s2", item.id, system, { question: item.question, answer: item.answer }, schema);
      if (!r.output) failures += 1;
      const truth = (item.truth as { wrongClaim: string }).wrongClaim;
      const hit = r.output ? textsOverlap(r.output.wrongClaim, truth) : false;
      rows.push({ id: item.id, truth, pred: r.output?.wrongClaim ?? null, hit, error: r.error });
    }
    const judged = rows.filter((r) => r.pred !== null);
    return { task: "s2", model, metrics: { n: rows.length, answered: judged.length, hitRate: judged.length ? judged.filter((r) => r.hit).length / judged.length : 0 }, rows, failures };
  },
  // S3 出下一问：只生成，写到 labels/ 等人工判"是否同一意图"
  async s3(file, items, config, label, model) {
    const schema = z.object({ nextQuestion: z.string().min(1).max(300), intent: z.string().max(120).describe("这一问想验证什么") });
    const rows = [];
    let failures = 0;
    for (const item of items) {
      const zh = item.lang === "zh";
      const system = zh
        ? "你是这场技术面试的面试官。下面是这场面试到目前为止面试官问过的问题（真实面经，没有记录候选人的回答）。请写出你接下来要问的一句话：一句只问一个要点，顺着前面的脉络往下，不重复。只输出 JSON。"
        : `You are the interviewer in this ML engineering interview. Given the resume and the conversation so far, write your next single question: one point per question, following up on what the applicant just said or moving to an uncovered rubric dimension. Output JSON only.\n\nRubric:\n${rubricText(file.rubric ?? {})}`;
      const payload = zh ? { role: item.role, company: item.company, title: item.title, priorQuestions: item.priorQuestions } : { resume: item.resume, conversation: item.prefix };
      const r = await ask(config, "s3", item.id, system, payload, schema);
      if (!r.output) failures += 1;
      rows.push({ id: item.id, lang: item.lang, context: zh ? item.priorQuestions : item.prefix, truthNext: (item.truth as { nextQuestion: string }).nextQuestion, modelNext: r.output?.nextQuestion ?? null, modelIntent: r.output?.intent ?? null, sameIntent: null as boolean | null, error: r.error });
    }
    fs.mkdirSync(LABELS_DIR, { recursive: true });
    const labelFile = path.join(LABELS_DIR, `s3-${safeName(label)}-${safeName(model)}.json`);
    fs.writeFileSync(labelFile, JSON.stringify({ instructions: "逐条读 truthNext 与 modelNext，判断是否在验证同一件事（sameIntent: true/false）。只看意图，不看措辞。", rows }, null, 1));
    console.log(`S3 生成完毕，人工标注文件：${labelFile}`);
    return { task: "s3", model, metrics: { n: rows.length, generated: rows.filter((r) => r.modelNext).length }, rows, failures };
  },
  // S4 追还是换（英文 ML，真值由裁判维度变化推得）
  async s4(file, items, config, _label, model) {
    const schema = z.object({ action: z.enum(["probe", "switch"]), reason: z.string().max(200) });
    const system = `You are the interviewer in this ML engineering interview. Given the resume and the conversation so far, decide your next move: "probe" = keep digging into the same rubric dimension the last question was about (the applicant's answer left room to go deeper or was unclear); "switch" = move to a different rubric dimension (this one is saturated, the applicant clearly can't go further, or others are uncovered). Output JSON only.\n\nRubric:\n${rubricText(file.rubric ?? {})}`;
    const rows = [];
    let failures = 0;
    for (const item of items) {
      const r = await ask(config, "s4", item.id, system, { resume: item.resume, conversation: item.prefix }, schema);
      if (!r.output) failures += 1;
      const truth = (item.truth as { action: string }).action;
      rows.push({ id: item.id, truth, pred: r.output?.action ?? null, error: r.error });
    }
    const b = binary(rows.map((r) => ({ truth: r.truth === "probe", pred: r.pred === null ? null : r.pred === "probe" })));
    return { task: "s4", model, metrics: { n: b.n, answered: b.answered, accuracy: b.accuracy, balancedAccuracy: b.balancedAccuracy }, rows, failures };
  },
  // S5 定层级（英文 ML）
  async s5(file, items, config, _label, model) {
    const schema = z.object({ level: z.enum(LEVELS), evidence: z.string().max(200).describe("verbatim quote from the answer") });
    const rows = [];
    let failures = 0;
    for (const item of items) {
      const anchors = item.anchors as Record<string, string>;
      const system = `You are a senior interviewer for an ML engineering role. Given one question and the applicant's answer, rate the applicant on the dimension "${item.dimension}" using these anchors:\nlow = ${anchors.low}\nmedium = ${anchors.medium}\nhigh = ${anchors.high}\nJudge only from what the answer shows. Output JSON only.`;
      const r = await ask(config, "s5", item.id, system, { question: item.question, answer: item.answer }, schema);
      if (!r.output) failures += 1;
      const truth = (item.truth as { level: string }).level;
      rows.push({ id: item.id, dimension: item.dimension, truth, pred: r.output?.level ?? null, error: r.error });
    }
    const judged = rows.filter((r) => r.pred !== null);
    const pairs = judged.map((r) => [levelIndex(r.truth), levelIndex(r.pred!)] as [number, number]);
    return {
      task: "s5",
      model,
      metrics: {
        n: rows.length,
        answered: judged.length,
        exactAccuracy: judged.length ? judged.filter((r) => r.truth === r.pred).length / judged.length : 0,
        adjacentAccuracy: judged.length ? pairs.filter(([a, b]) => Math.abs(a - b) <= 1).length / judged.length : 0,
        weightedKappa: weightedKappa(pairs),
      },
      rows,
      failures,
    };
  },
  // S6 出评分卡（英文 ML 整场）
  async s6(file, items, config, _label, model) {
    const dims = Object.keys(file.rubric ?? {});
    const levelShape = Object.fromEntries(dims.map((d) => [d, z.enum(LEVELS)]));
    const evidenceShape = Object.fromEntries(dims.map((d) => [d, z.string().max(160).describe("verbatim applicant quote")]));
    const schema = z.object({
      levels: z.object(levelShape),
      evidence: z.object(evidenceShape),
      redFlags: z.array(z.string().max(160)).max(4),
      overall: z.enum(["strong_no_hire", "no_hire", "hire", "strong_hire"]),
    });
    const system = `You are a senior interviewer for an ML engineering role writing the scorecard after a full interview. Given the resume, the rubric (6 dimensions × 3 anchored levels) and the complete transcript, rate the applicant on every dimension, cite one verbatim quote per dimension as evidence, list red flags (claims that were wrong, inflated, or that the applicant could not back up), and give an overall recommendation. Judge only from the transcript; the resume alone is not evidence. Output JSON only.\n\nRubric:\n${rubricText(file.rubric ?? {})}`;
    const archetypes = file.archetypes ?? {};
    const rows = [];
    let failures = 0;
    for (const item of items) {
      const r = await ask(config, "s6", item.id, system, { resume: item.resume, transcript: item.turns }, schema, 2_400);
      if (!r.output) failures += 1;
      const truth = (item.truth as { archetypeId: string; levels: Record<string, string> });
      const pred = (r.output?.levels ?? null) as Record<string, string> | null;
      let recovered: string | null = null;
      let exact = 0;
      let mae = 0;
      if (pred) {
        for (const d of dims) {
          const p = pred[d];
          if (p === truth.levels[d]) exact += 1;
          mae += p ? Math.abs(levelIndex(p) - levelIndex(truth.levels[d])) : 2;
        }
        // 最近原型：与每个原型按等级差的 L1 距离，取最小
        let best = Infinity;
        for (const [name, levels] of Object.entries(archetypes)) {
          const dist = dims.reduce((s, d) => s + (pred[d] ? Math.abs(levelIndex(pred[d]) - levelIndex(levels[d])) : 2), 0);
          if (dist < best) {
            best = dist;
            recovered = name;
          }
        }
      }
      rows.push({ id: item.id, truthArchetype: truth.archetypeId, recovered, exactDims: pred ? exact : null, mae: pred ? mae / dims.length : null, overall: r.output?.overall ?? null, redFlags: r.output?.redFlags ?? null, error: r.error });
    }
    const judged = rows.filter((r) => r.recovered !== null);
    return {
      task: "s6",
      model,
      metrics: {
        n: rows.length,
        answered: judged.length,
        archetypeRecovery: judged.length ? judged.filter((r) => r.recovered === r.truthArchetype).length / judged.length : 0,
        dimensionExactAccuracy: judged.length ? judged.reduce((s, r) => s + (r.exactDims ?? 0), 0) / (judged.length * dims.length) : 0,
        levelMae: judged.length ? judged.reduce((s, r) => s + (r.mae ?? 0), 0) / judged.length : 0,
      },
      rows,
      failures,
    };
  },
};

// ------------------------------------------------------------------ main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tasks = text(args, "tasks", "s1,s1b,s2,s4,s5,s6").split(",").map((s) => s.trim()).filter(Boolean);
  const modelNames = text(args, "models", "main").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = Number(text(args, "limit", "0"));
  const label = text(args, "label", new Date().toISOString().slice(0, 10));
  const models = await loadModels(modelNames);
  // 记账进 AgentRun 表（tag = bench:<label>），费用与失败率用 harness-report 或直接查表。
  installAgentRunPersistence();
  setAgentRunTag(`bench:${label}`);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const summary: string[] = ["| 子任务 | 模型 | 指标 |", "|---|---|---|"];
  for (const taskName of tasks) {
    const runner = TASKS[taskName];
    if (!runner) throw new Error(`未知子任务 ${taskName}`);
    const file = loadTask(taskName);
    const items = limit > 0 ? file.items.slice(0, limit) : file.items;
    for (const [modelName, config] of Object.entries(models)) {
      console.log(`▶ ${taskName} × ${modelName}（${config.provider}/${config.model}，${items.length} 题）`);
      const started = Date.now();
      const result = await runner(file, items, config, label, modelName);
      const out = { label, task: taskName, model: modelName, provider: config.provider, modelId: config.model, family: modelFamily(config), n: items.length, failures: result.failures, durationMs: Date.now() - started, metrics: result.metrics, rows: result.rows, createdAt: new Date().toISOString() };
      const file2 = path.join(RUNS_DIR, `${safeName(label)}-${taskName}-${safeName(modelName)}.json`);
      fs.writeFileSync(file2, JSON.stringify(out, null, 1));
      const metricText = Object.entries(result.metrics).map(([k, v]) => `${k}=${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(3)) : "—"}`).join(" ");
      summary.push(`| ${taskName} | ${modelName} | ${metricText}${result.failures ? `（失败 ${result.failures}）` : ""} |`);
      console.log(`  ${metricText} → ${path.relative(process.cwd(), file2)}`);
    }
  }
  console.log(`\n${summary.join("\n")}`);
  await flushAgentRunPersistence();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

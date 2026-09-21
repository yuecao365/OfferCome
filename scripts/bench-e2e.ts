import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { flushAgentRunPersistence, installAgentRunPersistence, setAgentRunTag } from "../src/lib/ai/agent-run-store";
import { runAgent } from "../src/lib/ai/run-agent";
import { salvageJson } from "../src/lib/ai/salvage-json";
import { candidateReply } from "../src/lib/evals/bench/candidate";
import { CLARIFICATION, gradeEpisode, summarize, type EpisodeGrade, type SubmissionSummary } from "../src/lib/evals/bench/grade";
import { resolveModel, safeName } from "../src/lib/evals/bench/models";
import { bareSubmission } from "../src/lib/evals/bench/submissions/bare";
import { offercomeSubmission } from "../src/lib/evals/bench/submissions/offercome";
import { scriptSubmission } from "../src/lib/evals/bench/submissions/script";
import { BENCH_LEVELS, INTERVIEW_NORMS, LEVEL_ANCHORS, type BenchLevel, type Episode, type Submission, type Task, type TranscriptTurn } from "../src/lib/evals/bench/types";

/**
 * InterviewBench 端到端层运行器（README §2–§6）。bench 驾驭对话：候选人由 env.json 里固定的模型模拟，提交者只出面试官的话与评分卡。
 *
 *   npm run bench:e2e -- --set dev --submissions bare:main,bare:openai:gpt-5.4-mini,script:main,offercome --k 1 --limit 3 --label smoke
 *   --turn-judge        每回合让 bench 侧裁判出一次等级（算"达到正确判断的回合数"），约多一倍费用
 *   --base http://localhost:3000   offercome 提交用的本地服务
 *   --recompute <label> 不调模型，把已有的 runs/e2e-<label>-*.json 用当前评分器重算并重写汇总（bench 版本不同的旧产物会标出来）
 *
 * 提交名：bare:<模型>、script:<模型>（模型写法见 models.ts）、offercome。产物 eval/bench/runs/e2e-<label>-<submission>.json。
 */

const BENCH_DIR = path.join(process.cwd(), "eval", "bench");
const RUNS_DIR = path.join(BENCH_DIR, "runs");
const env = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "env.json"), "utf8")) as { version: number; candidate: { model: string }; turnJudge: { model: string; promptVersion: string } };

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

function loadTasks(set: string, limit: number, only: string[]): Task[] {
  const dir = path.join(BENCH_DIR, "tasks", set);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const tasks = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Task).filter((t) => only.length === 0 || only.includes(t.id));
  return limit > 0 ? tasks.slice(0, limit) : tasks;
}

async function buildSubmission(spec: string, base: string, label: string): Promise<Submission> {
  if (spec === "offercome") return offercomeSubmission("offercome", { base, tag: `bench-e2e:${label}` });
  const [kind, ...rest] = spec.split(":");
  const modelSpec = rest.join(":");
  const config = await resolveModel(modelSpec);
  const name = `${kind}-${safeName(modelSpec)}`;
  if (kind === "bare") return bareSubmission(name, config);
  if (kind === "script") return scriptSubmission(name, config);
  throw new Error(`未知提交 ${spec}`);
}

// bench 侧的回合裁判：每回合看到目前为止的对话，给每项能力一个等级或"还判不出"。提交者不参与。
const turnJudgeSchema = z.object({ levels: z.record(z.string(), z.enum([...BENCH_LEVELS, "unknown"])) });
async function judgeTurn(config: Awaited<ReturnType<typeof resolveModel>>, task: Task, transcript: TranscriptTurn[], afterTurn: number): Promise<Record<string, BenchLevel | null>> {
  const { output } = await runAgent({
    agent: "bench_turn_judge",
    runId: `bench:judge:${task.id}:${afterTurn}`,
    config,
    feature: "InterviewBench",
    promptVersion: env.turnJudge.promptVersion,
    schema: turnJudgeSchema,
    maxOutputTokens: 400,
    timeoutMs: 60_000,
    untrustedInputs: "对话",
    system: `你是旁听这场技术面试的委员会成员。只根据到目前为止候选人说过的话，给每项能力一个等级：low = ${LEVEL_ANCHORS.low} medium = ${LEVEL_ANCHORS.medium} high = ${LEVEL_ANCHORS.high} 还没问到或证据不够就 unknown。能力：\n${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n")}\n输出 JSON：levels，键是能力 id。`,
    payload: { conversation: transcript.map((t) => `${t.role === "interviewer" ? "面试官" : "候选人"}：${t.text}`).join("\n") },
    rescue: salvageJson(turnJudgeSchema),
  });
  return Object.fromEntries(task.competencies.map((c) => [c.id, output.levels[c.id] && output.levels[c.id] !== "unknown" ? (output.levels[c.id] as BenchLevel) : null]));
}

async function runEpisode(task: Task, submission: Submission, run: number, options: { candidateModel: Awaited<ReturnType<typeof resolveModel>>; turnJudge: Awaited<ReturnType<typeof resolveModel>> | null }): Promise<Episode> {
  const started = Date.now();
  const transcript: TranscriptTurn[] = [];
  const turnScorecards: NonNullable<Episode["turnScorecards"]> = [];
  const interviewer = submission.create();
  let endedByInterviewer = false;
  try {
    await interviewer.start({ id: task.id, job: task.job, resume: task.resume, competencies: task.competencies, budget: task.budget, norms: INTERVIEW_NORMS });
    let candidateSaid: string | null = null;
    for (let turnIndex = 0; turnIndex < task.budget.maxTurns; turnIndex += 1) {
      const said = await interviewer.turn({ candidateSaid, turnIndex });
      endedByInterviewer = Boolean(said.end);
      const end = endedByInterviewer || turnIndex === task.budget.maxTurns - 1;
      transcript.push({ role: "interviewer", index: transcript.length, text: said.say, end });
      if (end) break;
      const reply = await candidateReply(options.candidateModel, { task, transcript, runId: `bench:cand:${task.id}:${run}:${turnIndex}` });
      transcript.push({ role: "candidate", index: transcript.length, text: reply.say, couldNotAnswer: reply.couldNotAnswer, askedForClarification: reply.askedForClarification, factsSaid: reply.factsSaid });
      candidateSaid = reply.say;
      if (options.turnJudge && turnIndex % 2 === 1) turnScorecards.push({ afterTurn: transcript.length - 1, levels: await judgeTurn(options.turnJudge, task, transcript, transcript.length - 1) });
    }
    const scorecard = await interviewer.scorecard();
    return { taskId: task.id, submission: submission.name, run, transcript, scorecard, endedByInterviewer, ...(options.turnJudge ? { turnScorecards } : {}), error: null, durationMs: Date.now() - started };
  } catch (error) {
    return { taskId: task.id, submission: submission.name, run, transcript, scorecard: null, endedByInterviewer, error: error instanceof Error ? error.message.slice(0, 300) : String(error), durationMs: Date.now() - started };
  }
}

const fmt = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? "—" : value.toFixed(digits));
function row(summary: SubmissionSummary): string {
  const hit = (type: string) => (summary.redFlagHit[type] ? `${summary.redFlagHit[type].hit}/${summary.redFlagHit[type].total}` : "—");
  return `| ${summary.submission} | ${summary.episodes}${summary.failed ? `（失败 ${summary.failed}）` : ""} | ${fmt(summary.levelExact)} / ${fmt(summary.levelAdjacent)} / ${fmt(summary.levelKappa)} | ${summary.monotonicity.violations}/${summary.monotonicity.pairs} | ${fmt(summary.evidenceVerbatim)} | ${hit("wrong")} · ${hit("inflated")} · ${hit("hollow")} | ${summary.probedOnSaid.hit}/${summary.probedOnSaid.total} | ${fmt(summary.falsePositivesPerEpisode)} · ${fmt(summary.unverifiedFlagsPerEpisode)} | ${fmt(summary.coverage)} | ${fmt(summary.turnsToCorrectMean, 1)} / ${fmt(summary.notReached)} | ${fmt(summary.conduct.multiQuestionRate)} · ${summary.conduct.repeated} · ${summary.conduct.leaked} · ${summary.conduct.pressedAfterDontKnow} · ${fmt(summary.conduct.endedProactively)} | ${fmt(summary.passRate)} / ${fmt(summary.passAllRuns)} | ${fmt(summary.turns, 1)} |`;
}
const HEADER = ["| 提交 | 场次 | 等级精确 / 相邻 / κ | 单调性违反 | 依据逐字 | 红旗命中 wrong · inflated · hollow | 当场追出 | 误报 · 引用不实/场 | 覆盖 | 达到正确判断的回合 / 未达到 | 一段多问率 · 重复 · 泄露 · 答不上后仍追 · 主动收尾 | 通过率 / k 次全过 | 回合 |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|"];

type RunFile = { benchVersion: number; gitCommit?: string; label: string; set: string; k: number; submission: string; models?: Submission["models"]; notes?: string; family?: string; candidateModel: string; turnJudge: boolean; summary: SubmissionSummary; episodes: (Episode & { grade: EpisodeGrade })[]; createdAt: string; recomputedAt?: string };
const gitCommit = () => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

/** 旧产物（bench v1）补齐 v2 字段：1–4 级评分卡压到三档（1、2 → 1，3 → 2，4 → 3）、求澄清按词表补标、强制结束一律不算主动收尾。 */
function upgradeEpisode(episode: Episode & { grade?: EpisodeGrade }, fromVersion: number): Episode {
  const { grade: _grade, ...rest } = episode;
  if (fromVersion >= 2) return rest;
  return {
    ...rest,
    endedByInterviewer: false,
    transcript: rest.transcript.map((turn) => (turn.role === "candidate" ? { ...turn, askedForClarification: turn.askedForClarification ?? (CLARIFICATION.test(turn.text) && turn.text.length <= 60) } : turn)),
    scorecard: rest.scorecard ? { ...rest.scorecard, ratings: rest.scorecard.ratings.map((r) => ({ ...r, level: Math.max(1, (r.level as number) - 1) as 1 | 2 | 3 })) } : null,
  };
}

function recompute(label: string) {
  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.startsWith(`e2e-${safeName(label)}-`) && f.endsWith(".json"));
  if (files.length === 0) throw new Error(`没有 e2e-${label}-*.json`);
  const table = [...HEADER];
  for (const file of files) {
    const full = path.join(RUNS_DIR, file);
    const data = JSON.parse(fs.readFileSync(full, "utf8")) as RunFile;
    const tasks = new Map(loadTasks(data.set, 0, []).map((t) => [t.id, t]));
    const items = data.episodes.flatMap((raw) => {
      const task = tasks.get(raw.taskId);
      if (!task) return [];
      const episode = upgradeEpisode(raw, data.benchVersion);
      return [{ task, episode, grade: gradeEpisode(task, episode) }];
    });
    const summary = summarize(data.submission, items);
    fs.writeFileSync(full, JSON.stringify({ ...data, summary, episodes: items.map((item) => ({ ...item.episode, grade: item.grade })), recomputedAt: new Date().toISOString(), recomputedFromVersion: data.benchVersion, graderVersion: env.version }, null, 1));
    table.push(row(summary) + (data.benchVersion !== env.version ? ` ← bench v${data.benchVersion} 产物，用 v${env.version} 评分器重算：等级映射有损，且任务埋点已被 --repair 增删过、factsSaid 下标可能移位，红旗三列不可读` : ""));
  }
  console.log(table.join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.recompute === "string") return recompute(args.recompute);
  const set = text(args, "set", "dev");
  const label = text(args, "label", new Date().toISOString().slice(0, 10));
  const k = Number(text(args, "k", "1"));
  const limit = Number(text(args, "limit", "0"));
  const only = text(args, "tasks", "").split(",").map((s) => s.trim()).filter(Boolean);
  const base = text(args, "base", "http://localhost:3000");
  const specs = text(args, "submissions", "bare:main").split(",").map((s) => s.trim()).filter(Boolean);
  const tasks = loadTasks(set, limit, only);
  const candidateModel = await resolveModel(env.candidate.model);
  const turnJudge = args["turn-judge"] ? await resolveModel(env.turnJudge.model) : null;
  installAgentRunPersistence();
  setAgentRunTag(`bench-e2e:${label}`);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const table = [...HEADER];
  for (const spec of specs) {
    const submission = await buildSubmission(spec, base, label);
    console.log(`▶ ${submission.name}（${tasks.length} 任务 × k=${k}，面试 ${submission.models.interviewer} / 评分卡 ${submission.models.scorecard}，候选人 ${env.candidate.model}${turnJudge ? "，带回合裁判" : ""}）`);
    const items: { task: Task; episode: Episode; grade: EpisodeGrade }[] = [];
    const file = path.join(RUNS_DIR, `e2e-${safeName(label)}-${safeName(submission.name)}.json`);
    const save = () => {
      const summary = summarize(submission.name, items);
      const out: RunFile = { benchVersion: env.version, gitCommit: gitCommit(), label, set, k, submission: submission.name, models: submission.models, notes: submission.notes, candidateModel: env.candidate.model, turnJudge: Boolean(turnJudge), summary, episodes: items.map((item) => ({ ...item.episode, grade: item.grade })), createdAt: new Date().toISOString() };
      fs.writeFileSync(file, JSON.stringify(out, null, 1));
      return summary;
    };
    for (const task of tasks)
      for (let run = 1; run <= k; run += 1) {
        const episode = await runEpisode(task, submission, run, { candidateModel, turnJudge });
        const grade = gradeEpisode(task, episode);
        items.push({ task, episode, grade });
        console.log(`  ${task.id} run ${run}: ${episode.error ? `失败 ${episode.error}` : `${episode.transcript.filter((t) => t.role === "interviewer").length} 回合${episode.endedByInterviewer ? "" : "（强制结束）"} · 等级 ${grade.judgement.exact}/${grade.judgement.rated} · 红旗 ${grade.facts.facts.filter((f) => f.flagged).length}/${grade.facts.facts.filter((f) => f.said).length} 误报 ${grade.facts.falsePositives} · ${grade.pass ? "过" : "不过"}`}`);
        save(); // 每场落盘，中途停掉也不丢
      }
    table.push(row(save()));
    console.log(`  → ${path.relative(process.cwd(), file)}`);
  }
  console.log(`\n${table.join("\n")}`);
  await flushAgentRunPersistence();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

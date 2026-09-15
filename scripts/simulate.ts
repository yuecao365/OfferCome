import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { flushAgentRunPersistence, installAgentRunPersistence, setAgentRunTag } from "../src/lib/ai/agent-run-store";
import { prisma } from "../src/lib/db";
import { EVAL_DIR, loadJdFixture, loadResumeText } from "../src/lib/evals/fixtures";
import { ensureFixtureResume } from "../src/lib/evals/resume-row";
import { loadSessionFacts } from "../src/lib/interview/eval/facts";
import { renderSummaryTable, sessionMetrics, summarize, type SessionMetrics } from "../src/lib/interview/eval/metrics";
import { ARCHETYPE_LABELS, ARCHETYPES, sampleAbilities, simulateReply, type Archetype, type SyntheticCandidate } from "../src/lib/interview/eval/simulator";
import type { TranscriptLine } from "../src/lib/interview/events";
import { competenciesOf } from "../src/lib/mock-interviews/context";
import { getAiTaskConfig } from "../src/lib/settings/ai";

/**
 * 自博弈运行器（interview-system-design.md §6.3 / §8）：合成候选人对被测系统面试，走真实 HTTP 接口，
 * 结果从事件日志算指标，写到 eval/runs/sim-<tag>.json。
 *
 * 用法：npm run simulate -- --tag baseline --jd tencent-hunyuan-agent-harness-engineer --resume synthetic-ai-llm \
 *        --archetypes solid,shaky,rambling,needy,adversarial --seeds 3 --pace standard --concurrency 1 --critic on|off --policy v2|v2-terse --shadow v2-terse
 *      npm run simulate -- --tag baseline --recompute     # 只按标签重算已有会话的指标
 */

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

type Case = { id: string; archetype: Archetype; seed: number };
type CaseResult = Case & { sessionId: string; abilities: SyntheticCandidate["abilities"]; turns: number; error: string | null; metrics: SessionMetrics | null };

type WireTurn = { replay: boolean; messages?: { role: string; kind: string; content: string }[]; payload?: { phase: string; newMessages: { role: string; kind: string; content: string }[] } };

/** 瞬时网络错误（fetch failed / 超时）重试一次：回合接口按 clientId 幂等，重发不会多出一个回合。 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    console.warn(`  请求失败，3 秒后重试：${error instanceof Error ? error.message : String(error)}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    return fetch(url, init);
  }
}

async function postTurn(base: string, sessionId: string, body: Record<string, unknown>, attempt = 1): Promise<{ said: { kind: string; content: string }[]; phase: string | null }> {
  const response = await fetchWithRetry(`${base}/api/interviews/mock/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`turn ${response.status}: ${raw.slice(0, 200)}`);
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const chunk = JSON.parse(line.slice(6)) as { type?: string; data?: WireTurn };
      if (chunk.type !== "data-turn" || !chunk.data) continue;
      if (chunk.data.replay) return { said: (chunk.data.messages ?? []).filter((message) => message.role === "interviewer"), phase: null };
      return { said: (chunk.data.payload?.newMessages ?? []).filter((message) => message.role === "interviewer"), phase: chunk.data.payload?.phase ?? null };
    } catch {}
  }
  // 流中途断了（没有 data-turn 也没有错误块）：重发一次，落库过的回合会按 clientId 回放。
  if (attempt === 1) {
    console.warn(`  回合没有返回 data-turn，重试一次`);
    return postTurn(base, sessionId, body, 2);
  }
  throw new Error(`回合没有返回 data-turn：${raw.slice(-300)}`);
}

async function waitReady(base: string, sessionId: string): Promise<void> {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const json = (await fetch(`${base}/api/interviews/mock/${sessionId}/status`).then((response) => response.json())) as { status: string; generationError?: string | null };
    if (json.status === "in_progress") return;
    if (json.status === "generation_failed" || json.status === "failed") throw new Error(`备课失败：${json.generationError ?? ""}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("备课超时");
}

/** 面试结束后等交卷跑完（切段 + 评分 + 汇总）：覆盖类指标要看整理员的分段。 */
async function waitCompleted(base: string, sessionId: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let status = "";
  while (Date.now() < deadline) {
    status = ((await fetch(`${base}/api/interviews/mock/${sessionId}/status`).then((response) => response.json())) as { status: string }).status;
    if (status === "completed") return status;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return status;
}

async function createSession(base: string, input: { jd: string; resumeDbId: string; pace: string; label: string; tag: string; critic: boolean; policy: string | null; shadow: string | null }): Promise<string> {
  const jd = loadJdFixture(input.jd);
  const form = new FormData();
  form.set("companyName", input.label);
  form.set("jobTitle", jd.title);
  form.set("resumeId", input.resumeDbId);
  form.set("pace", input.pace);
  form.set("round", "first_interview");
  form.set("jobDescriptionText", jd.jobDescription);
  const response = await fetch(`${base}/api/interviews/mock`, { method: "POST", body: form });
  const json = (await response.json()) as { id?: string; interviewId?: string; error?: string };
  if (!response.ok || !json.id || !json.interviewId) throw new Error(`创建会话失败：${json.error ?? response.status}`);
  await prisma.interview.update({ where: { id: json.interviewId }, data: { evalTag: input.tag } });
  // 会话开关：评论员关、指定策略变体、影子变体；备课完成时只补没写的项。
  const flags = { ...(input.critic ? {} : { critic: false }), ...(input.policy ? { policy: input.policy } : {}), ...(input.shadow ? { shadow: input.shadow } : {}) };
  if (Object.keys(flags).length > 0) await prisma.mockInterviewSession.update({ where: { id: json.id }, data: { flagsJson: JSON.stringify(flags) } });
  return json.id;
}

/** 备课完成后从会话快照里取岗位能力模型：能力真值按它采样。 */
async function loadCompetencies(sessionId: string): Promise<{ id: string; name: string }[]> {
  const session = await prisma.mockInterviewSession.findUniqueOrThrow({ where: { id: sessionId }, select: { contextSnapshotJson: true } });
  return competenciesOf(session.contextSnapshotJson);
}

const truthOf = (abilities: { competencyId: string; level: number }[]) => abilities.map((item) => ({ competencyId: item.competencyId, level: item.level }));

async function runCase(base: string, item: Case, config: { jd: string; resume: string; resumeDbId: string; pace: string; tag: string; maxTurns: number; critic: boolean; policy: string | null; shadow: string | null }): Promise<CaseResult> {
  const jd = loadJdFixture(config.jd);
  const resumeText = loadResumeText(config.resume);
  const sessionId = await createSession(base, { jd: config.jd, resumeDbId: config.resumeDbId, pace: config.pace, label: `模拟 ${item.id}`, tag: config.tag, critic: config.critic, policy: config.policy, shadow: config.shadow });
  const result: CaseResult = { ...item, sessionId, abilities: [], turns: 0, error: null, metrics: null };
  try {
    await waitReady(base, sessionId);
    const candidate: SyntheticCandidate = { archetype: item.archetype, seed: item.seed, abilities: sampleAbilities(await loadCompetencies(sessionId), item.archetype, item.seed) };
    result.abilities = candidate.abilities;
    const model = await getAiTaskConfig("text");
    const transcript: TranscriptLine[] = [];
    const record = (said: { kind: string; content: string }[]) => {
      for (const message of said) transcript.push({ seq: transcript.length, role: "interviewer", content: message.content, kind: message.kind, control: null });
    };
    record((await postTurn(base, sessionId, { kind: "start" })).said);
    for (let turn = 1; turn <= config.maxTurns; turn += 1) {
      const reply = await simulateReply(model, { candidate, resumeText, jobTitle: jd.title, transcript, turn, runId: `sim:${sessionId}:${turn}` });
      if (reply.content) transcript.push({ seq: transcript.length, role: "candidate", content: reply.content, kind: null, control: reply.control });
      const outcome = await postTurn(base, sessionId, { clientId: `sim-${turn}`, content: reply.content, intent: reply.control });
      record(outcome.said);
      result.turns = turn;
      const last = outcome.said.at(-1);
      console.log(`  [${item.id}] ${turn} ${last?.kind ?? "-"} ${(last?.content ?? "").replace(/\s+/g, " ").slice(0, 70)}`);
      if (outcome.phase === "ended") break;
    }
    if (result.turns >= config.maxTurns) {
      await postTurn(base, sessionId, { clientId: "sim-hardstop", content: "", intent: "end" });
      result.error = "hardstop";
    }
    const status = await waitCompleted(base, sessionId, 4 * 60_000);
    if (status !== "completed") console.warn(`  [${item.id}] 交卷还没完成（${status}），覆盖类指标可能不全；之后可用 --recompute 重算。`);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`  [${item.id}] 失败：${result.error}`);
  }
  result.metrics = sessionMetrics(await loadSessionFacts(sessionId, truthOf(result.abilities)));
  return result;
}

async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

async function recompute(tag: string): Promise<CaseResult[]> {
  const sessions = await prisma.mockInterviewSession.findMany({ where: { interview: { evalTag: tag } }, include: { interview: { select: { companyName: true } } }, orderBy: { createdAt: "asc" } });
  const results: CaseResult[] = [];
  for (const session of sessions) {
    const match = session.interview.companyName.match(/^模拟 ([a-z]+)-(\d+)$/);
    const archetype = (match?.[1] ?? "solid") as Archetype;
    const seed = Number(match?.[2] ?? 0);
    // 真值按 seed 重采（采样是确定的），重算时也能对照估计器。
    const abilities = match ? sampleAbilities(competenciesOf(session.contextSnapshotJson), archetype, seed) : [];
    results.push({ id: match ? `${match[1]}-${match[2]}` : session.id, archetype, seed, sessionId: session.id, abilities, turns: 0, error: null, metrics: sessionMetrics(await loadSessionFacts(session.id, truthOf(abilities))) });
  }
  return results;
}

function report(results: CaseResult[]): string {
  const done = results.filter((item) => item.metrics !== null);
  const columns = [{ name: "全部", summary: summarize(done.map((item) => item.metrics!)) }];
  for (const archetype of ARCHETYPES) {
    const group = done.filter((item) => item.archetype === archetype);
    if (group.length > 0) columns.push({ name: ARCHETYPE_LABELS[archetype], summary: summarize(group.map((item) => item.metrics!)) });
  }
  return renderSummaryTable(columns);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = `sim:${text(args, "tag", new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""))}`;
  const outDir = path.join(EVAL_DIR, "runs");
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${tag.replace(":", "-")}.json`);

  let results: CaseResult[];
  if (args.recompute) {
    results = await recompute(tag);
  } else {
    installAgentRunPersistence();
    setAgentRunTag(tag);
    const base = text(args, "base", "http://localhost:3000");
    const archetypes = text(args, "archetypes", ARCHETYPES.join(",")).split(",").filter((item): item is Archetype => (ARCHETYPES as readonly string[]).includes(item));
    // --seeds 3 = 种子 1..3；--seeds 2-3 = 只跑种子 2 与 3（补跑单场用）。
    const seedSpec = text(args, "seeds", "3");
    const [seedFrom, seedTo] = seedSpec.includes("-") ? seedSpec.split("-").map(Number) : [1, Number(seedSpec)];
    const config = {
      jd: text(args, "jd", "tencent-hunyuan-agent-harness-engineer"),
      resume: text(args, "resume", "synthetic-ai-llm"),
      pace: text(args, "pace", "standard"),
      tag,
      maxTurns: Number(text(args, "max-turns", "45")),
      critic: text(args, "critic", "on") !== "off",
      policy: typeof args.policy === "string" ? args.policy : null,
      shadow: typeof args.shadow === "string" ? args.shadow : null,
      resumeDbId: "",
    };
    config.resumeDbId = await ensureFixtureResume(config.resume);
    const cases: Case[] = archetypes.flatMap((archetype) => Array.from({ length: seedTo - seedFrom + 1 }, (_, index) => ({ id: `${archetype}-${seedFrom + index}`, archetype, seed: seedFrom + index })));
    console.log(`${tag}：${cases.length} 场（${archetypes.map((item) => ARCHETYPE_LABELS[item]).join(" / ")} × 种子 ${seedFrom}–${seedTo}），JD ${config.jd}，简历 ${config.resume}，节奏 ${config.pace}`);
    // SQLite 单写者：并发 2 以上会让另一场的落库等锁超时，默认串行。
    results = await pool(cases, Number(text(args, "concurrency", "1")), (item) => runCase(base, item, config));
    await flushAgentRunPersistence();
  }

  const table = report(results);
  const body = { tag, createdAt: new Date().toISOString(), args, results, summary: summarize(results.filter((item) => item.metrics).map((item) => item.metrics!)) };
  await fs.writeFile(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  console.log(`\n${table}\n\n失败：${results.filter((item) => item.error).map((item) => `${item.id}（${item.error}）`).join("、") || "无"}\n产物：${file}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

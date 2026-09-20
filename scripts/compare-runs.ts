import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "../src/lib/db";
import { EVAL_DIR } from "../src/lib/evals/fixtures";
import { spearman } from "../src/lib/interview/estimator";
import type { Expectation } from "../src/lib/interview/eval/expectations";

/**
 * 两批同配置场次的对照（改造前 vs 改造后）：同 (画像, 种子) 配对，报每档汇总与逐对符号计数。
 * 汇总里除了 run 文件自带的行为判定、信息量、token，还回库补三项运行时指标：提问工具采用率、每回合退回次数、失败调用数。
 *
 * 用法：npm run compare-runs -- eval/runs/premerge-packs-on.json 合并前 eval/runs/sim-ablate-packs-on-2026-09-20.json 合并后
 */

type CaseRow = {
  id: string;
  sessionId: string;
  error: string | null;
  turns: number;
  expectations?: Expectation[];
  gainPerProbe?: number | null;
  metrics?: { estimatePairs?: [number, number][]; tokens?: { input: number; cacheRate: number }; multiQuestionRate?: number } | null;
};

type Runtime = { calls: number; viaTool: number; failed: number; fallbacks: number; said: number };

const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);
const fmt = (value: number | null, digits = 2) => (value === null ? "—" : value.toFixed(digits));
const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(0)}%`);

async function runtimeOf(row: CaseRow): Promise<Runtime> {
  const runs = await prisma.agentRun.findMany({ where: { runId: { startsWith: `turn:${row.sessionId}:` }, agent: "interviewer", event: "model_call" }, select: { status: true, errorKind: true } });
  const said = await prisma.interviewEvent.count({ where: { sessionId: row.sessionId, type: "interviewer_said" } });
  const fallbacks = await prisma.interviewEvent.count({ where: { sessionId: row.sessionId, type: "fallback_used" } });
  return {
    calls: runs.length,
    viaTool: runs.filter((item) => item.status === "partial" && item.errorKind === "interrupted").length,
    failed: runs.filter((item) => item.status === "failed").length,
    fallbacks,
    said,
  };
}

function rho(rows: CaseRow[]): string {
  const buckets = rows.map((row) => row.metrics?.estimatePairs ?? []).filter((pairs) => pairs.length > 0);
  const value = spearman(buckets.flat());
  if (value === null) return "—";
  let state = 7;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const draws: number[] = [];
  for (let round = 0; round < 2_000; round += 1) {
    const sample = spearman(Array.from({ length: buckets.length }, () => buckets[Math.floor(random() * buckets.length)]).flat());
    if (sample !== null) draws.push(sample);
  }
  draws.sort((left, right) => left - right);
  const ci = draws.length ? ` [${draws[Math.floor(draws.length * 0.025)].toFixed(2)}, ${draws[Math.floor(draws.length * 0.975)].toFixed(2)}]` : "";
  return `${value.toFixed(3)}${ci}（${buckets.flat().length} 对）`;
}

async function summarize(rows: CaseRow[]): Promise<{ table: Record<string, string>; perCase: Map<string, { gain: number | null; passed: number; fallbacks: number; input: number }> }> {
  const ok = rows.filter((row) => !row.error);
  const runtimes = await Promise.all(ok.map(runtimeOf));
  const expectations = ok.flatMap((row) => (row.expectations ?? []).filter((item) => item.applies && item.passed !== null));
  const calls = runtimes.reduce((sum, item) => sum + item.calls, 0);
  const table = {
    跑通场次: `${ok.length} / ${rows.length}`,
    回合数: fmt(mean(ok.map((row) => row.turns)), 1),
    行为判定通过: expectations.length ? `${expectations.filter((item) => item.passed).length} / ${expectations.length}` : "—",
    一句多问比例: pct(mean(ok.map((row) => row.metrics?.multiQuestionRate ?? 0))),
    每次追问信息量: fmt(mean(ok.map((row) => row.gainPerProbe).filter((value): value is number => typeof value === "number")), 1),
    提问工具采用率: calls ? pct(runtimes.reduce((sum, item) => sum + item.viaTool, 0) / calls) : "—",
    "退回次数 / 发言数": `${runtimes.reduce((sum, item) => sum + item.fallbacks, 0)} / ${runtimes.reduce((sum, item) => sum + item.said, 0)}`,
    失败调用: String(runtimes.reduce((sum, item) => sum + item.failed, 0)),
    "每场输入 token / 缓存": `${fmt(mean(ok.map((row) => row.metrics?.tokens?.input ?? 0)), 0)} / ${pct(mean(ok.map((row) => row.metrics?.tokens?.cacheRate ?? 0)))}`,
    "估计·秩相关 ρ": rho(ok),
  };
  const perCase = new Map<string, { gain: number | null; passed: number; fallbacks: number; input: number }>();
  ok.forEach((row, index) => {
    const items = (row.expectations ?? []).filter((item) => item.applies && item.passed !== null);
    perCase.set(row.id, { gain: typeof row.gainPerProbe === "number" ? row.gainPerProbe : null, passed: items.filter((item) => item.passed).length, fallbacks: runtimes[index].fallbacks, input: row.metrics?.tokens?.input ?? 0 });
  });
  return { table, perCase };
}

async function main(): Promise<void> {
  const [fileA, labelA, fileB, labelB] = process.argv.slice(2);
  if (!fileA || !fileB) throw new Error("用法：compare-runs <run A> <标签 A> <run B> <标签 B>");
  const read = async (file: string) => (JSON.parse(await fs.readFile(path.resolve(file), "utf8")) as { results: CaseRow[] }).results;
  const a = await summarize(await read(fileA));
  const b = await summarize(await read(fileB));

  const width = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
  const pad = (text: string, size: number) => text + " ".repeat(Math.max(0, size - width(text)));
  const keys = Object.keys(a.table);
  const w0 = Math.max(...keys.map(width)), wa = Math.max(width(labelA), ...Object.values(a.table).map(width)), wb = Math.max(width(labelB), ...Object.values(b.table).map(width));
  const lines = [
    `| ${pad("指标", w0)} | ${pad(labelA, wa)} | ${pad(labelB, wb)} |`,
    `|${"-".repeat(w0 + 2)}|${"-".repeat(wa + 2)}|${"-".repeat(wb + 2)}|`,
    ...keys.map((key) => `| ${pad(key, w0)} | ${pad(a.table[key], wa)} | ${pad(b.table[key], wb)} |`),
  ];
  const pairs = [...a.perCase.keys()].filter((id) => b.perCase.has(id));
  const sign = (pick: (item: { gain: number | null; passed: number; fallbacks: number; input: number }) => number | null, higherIsBetter = true) => {
    let better = 0, worse = 0, tie = 0;
    for (const id of pairs) {
      const x = pick(a.perCase.get(id)!), y = pick(b.perCase.get(id)!);
      if (x === null || y === null) continue;
      const delta = higherIsBetter ? y - x : x - y;
      if (delta > 0) better += 1; else if (delta < 0) worse += 1; else tie += 1;
    }
    return `${labelB}优 ${better} / ${labelA}优 ${worse} / 平 ${tie}`;
  };
  const report = [
    `# ${labelA} vs ${labelB}（同画像同种子，${pairs.length} 对）`,
    "",
    ...lines,
    "",
    `配对：信息量 ${sign((item) => item.gain)}；判定通过数 ${sign((item) => item.passed)}；退回次数 ${sign((item) => item.fallbacks, false)}；输入 token ${sign((item) => item.input, false)}`,
    "",
  ].join("\n");
  console.log(`\n${report}`);
  const out = path.join(EVAL_DIR, "runs", `compare-${new Date().toISOString().slice(0, 10)}.md`);
  await fs.writeFile(out, report, "utf8");
  console.log(`产物：${out}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});

import fs from "node:fs/promises";
import path from "node:path";

import { EVAL_DIR } from "../src/lib/evals/fixtures";
import { loadSessionFacts } from "../src/lib/interview/eval/facts";
import { estimatorMetrics } from "../src/lib/interview/eval/metrics";
import { pearson, spearman } from "../src/lib/interview/estimator";
import { prisma } from "../src/lib/db";

/**
 * 第 0 步：不跑任何新场次，只把已经采集到的东西拉出来。
 *
 * A. harness 可靠性——从 AgentRun 的 3000+ 条记录算：结构化输出的降级救回率、预算触顶、工具调用、延迟、缓存。
 *    这些数客观、零成本、不依赖任何评分标准或模拟器保真度。
 * B. 估计器预检——从 eval/runs/*.json 里已有的（估计, 真值）配对算相关与动态范围。
 *    它回答"再花钱跑对照表测得出差异吗"：估计值要是没有动态范围，任何档位对照都是噪声。
 *
 * 用法：npm run harness-report
 */

type Row = string[];

const width = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);

function table(header: Row, rows: Row[]): string {
  const all = [header, ...rows];
  const widths = header.map((_, column) => Math.max(...all.map((row) => width(row[column] ?? ""))));
  const line = (row: Row) => `| ${row.map((cell, column) => (cell ?? "") + " ".repeat(Math.max(0, widths[column] - width(cell ?? "")))).join(" | ")} |`;
  return [line(header), `|${widths.map((value) => "-".repeat(value + 2)).join("|")}|`, ...rows.map(line)].join("\n");
}

const pct = (part: number, total: number) => (total === 0 ? "—" : `${((part / total) * 100).toFixed(1)}%`);

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)];
}

/** A. 每个 agent 的调用可靠性。partial = 结构化输出失败后由收敛 / 修补 / rescue 救回来的。 */
async function harnessSection(): Promise<{ text: string; data: unknown }> {
  const calls = await prisma.agentRun.findMany({
    where: { event: "model_call" },
    select: { agent: true, status: true, durationMs: true, inputTokens: true, cachedTokens: true, outputTokens: true, errorKind: true, tag: true, provider: true, model: true, metricsJson: true },
  });
  const subEvents = await prisma.agentRun.groupBy({ by: ["agent", "event"], _count: { _all: true }, where: { event: { in: ["repair", "budget_exceeded", "tool_result", "step"] } } });
  const subOf = (agent: string, event: string) => subEvents.find((row) => row.agent === agent && row.event === event)?._count._all ?? 0;

  const agents = [...new Set(calls.map((call) => call.agent))].sort();
  const rows: Row[] = [];
  for (const agent of agents) {
    const mine = calls.filter((call) => call.agent === agent);
    const success = mine.filter((call) => call.status === "success").length;
    const partial = mine.filter((call) => call.status === "partial").length;
    const failed = mine.filter((call) => call.status === "failed").length;
    const durations = mine.map((call) => call.durationMs);
    rows.push([
      agent,
      String(mine.length),
      pct(success + partial, mine.length),
      // 没能一次拿到合规结构化输出的调用里，最终救回来的比例：harness 三层降级的直接成绩。
      partial + failed === 0 ? "—" : pct(partial, partial + failed),
      String(subOf(agent, "repair")),
      String(subOf(agent, "budget_exceeded")),
      String(subOf(agent, "tool_result")),
      `${Math.round(percentile(durations, 0.5))} / ${Math.round(percentile(durations, 0.95))}`,
    ]);
  }

  const totals = { calls: calls.length, success: calls.filter((call) => call.status === "success").length, partial: calls.filter((call) => call.status === "partial").length, failed: calls.filter((call) => call.status === "failed").length };
  const input = calls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0);
  const cached = calls.reduce((sum, call) => sum + (call.cachedTokens ?? 0), 0);
  const cost = calls.reduce((sum, call) => {
    const metrics = call.metricsJson ? (JSON.parse(call.metricsJson) as { costUsd?: number }) : null;
    return sum + (metrics?.costUsd ?? 0);
  }, 0);
  const real = calls.filter((call) => !call.tag).length;
  const models = [...new Set(calls.map((call) => `${call.provider}/${call.model}`))];

  const text = [
    "## A. harness 可靠性（已采集，未新跑）",
    "",
    table(["agent", "调用数", "可用产出率", "降级救回率", "修补次数", "预算触顶", "工具返回", "延迟 p50/p95 ms"], rows),
    "",
    `合计 ${totals.calls} 次模型调用：一次成功 ${totals.success}、降级救回 ${totals.partial}、失败 ${totals.failed}（可用产出率 ${pct(totals.success + totals.partial, totals.calls)}）。`,
    `其中真实使用 ${real} 次、评测 ${calls.length - real} 次。跨 ${models.length} 个 provider/model 组合：${models.join("、")}。`,
    `提示词缓存命中 ${pct(cached, input)}（${cached} / ${input} 输入 token），累计成本 $${cost.toFixed(2)}。`,
  ].join("\n");
  return { text, data: { totals, byAgent: rows, input, cached, cost, real, models } };
}

/** B. 估计器预检：已有场次里（估计, 真值）的相关与动态范围，决定值不值得再花钱跑对照表。 */
async function estimatorSection(): Promise<{ text: string; data: unknown }> {
  // run 文件只顺手存了一部分配对；真值（abilities）和 sessionId 都在里面，直接回库重算，样本能大三倍。
  const dir = path.join(EVAL_DIR, "runs");
  const files = (await fs.readdir(dir)).filter((name) => name.startsWith("sim-") && name.endsWith(".json"));
  const truthOf = new Map<string, { competencyId: string; level: number }[]>();
  for (const name of files) {
    const parsed = JSON.parse(await fs.readFile(path.join(dir, name), "utf8")) as {
      results?: { sessionId?: string; abilities?: { competencyId?: string; level?: number }[] }[];
    };
    for (const result of parsed.results ?? []) {
      const truth = (result.abilities ?? []).flatMap((item) =>
        item.competencyId && typeof item.level === "number" ? [{ competencyId: item.competencyId, level: item.level }] : [],
      );
      if (result.sessionId && truth.length > 0) truthOf.set(result.sessionId, truth);
    }
  }

  const pairs: [number, number][] = [];
  const perSession: number[] = [];
  let sessions = 0;
  let withPairs = 0;
  for (const [sessionId, truth] of truthOf) {
    sessions += 1;
    try {
      const mine = estimatorMetrics(await loadSessionFacts(sessionId, truth)).estimatePairs;
      if (mine.length > 0) withPairs += 1;
      perSession.push(mine.length);
      pairs.push(...mine);
    } catch {
      // 会话已被清掉的跳过。
    }
  }

  const estimates = pairs.map(([estimate]) => estimate);
  const truths = pairs.map(([, truth]) => truth);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  const std = (values: number[]) => Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
  // 下限：对谁都预测真值的池化均值。任何估计器打不过它就等于没干活。
  const floorMae = mean(truths.map((truth) => Math.abs(truth - mean(truths))));
  const mae = mean(pairs.map(([estimate, truth]) => Math.abs(estimate - truth)));
  const levels = [...new Set(truths)].sort();

  // 对场次做 bootstrap（不是对配对——同一场内的配对相关），拿秩相关的 95% 区间。
  const byBucket: [number, number][][] = [];
  let cursor = 0;
  for (const count of perSession) {
    byBucket.push(pairs.slice(cursor, cursor + count));
    cursor += count;
  }
  const random = (() => { let state = 42; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; })();
  const draws: number[] = [];
  for (let round = 0; round < 2_000; round += 1) {
    const resampled = Array.from({ length: byBucket.length }, () => byBucket[Math.floor(random() * byBucket.length)]).flat();
    const value = spearman(resampled);
    if (value !== null) draws.push(value);
  }
  draws.sort((left, right) => left - right);
  const ci = draws.length === 0 ? null : ([draws[Math.floor(draws.length * 0.025)], draws[Math.floor(draws.length * 0.975)]] as const);

  const rows: Row[] = [
    ["场次（含无测量的）", String(sessions)],
    ["有（估计, 真值）配对的场次", String(withPairs)],
    ["配对总数", String(pairs.length)],
    ["真值档位分布", levels.map((level) => `${level}×${truths.filter((value) => value === level).length}`).join("  ")],
    ["真值 标准差", std(truths).toFixed(3)],
    ["估计值 范围", pairs.length === 0 ? "—" : `${Math.min(...estimates).toFixed(3)} – ${Math.max(...estimates).toFixed(3)}`],
    ["估计值 标准差", std(estimates).toFixed(3)],
    ["Pearson r", (pearson(pairs) ?? NaN).toFixed(3)],
    ["Spearman ρ（主指标候选）", `${(spearman(pairs) ?? NaN).toFixed(3)}${ci ? `  95% 区间 [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]` : ""}`],
    ["MAE（估计 vs 真值）", mae.toFixed(3)],
    ["MAE 下限（恒定预测均值）", floorMae.toFixed(3)],
  ];

  const rho = spearman(pairs) ?? 0;
  const range = pairs.length === 0 ? 0 : Math.max(...estimates) - Math.min(...estimates);
  const verdict =
    pairs.length < 30
      ? `配对只有 ${pairs.length} 个，样本不足以判断，先扩样本。`
      : range < 0.25
        ? `**估计值的动态范围只有 ${range.toFixed(3)}（真值跨度 ${(Math.max(...truths) - Math.min(...truths)).toFixed(1)}）——估计器几乎把所有人压成同一个数。再花钱跑档位对照测不出差异，先修估计器的尺度。**`
        : Math.abs(rho) < 0.2
          ? `**秩相关 ${rho.toFixed(3)} 接近 0：现在的估计和真值基本无关。对照表跑出来也是噪声。**`
          : `秩相关 ${rho.toFixed(3)}、动态范围 ${range.toFixed(3)}，有信号，值得跑档位对照。`;

  const text = ["## B. 估计器预检（决定第 1 步跑不跑）", "", table(["项", "值"], rows), "", `判定：${verdict}`].join("\n");
  return { text, data: { sessions, withPairs, pairs: pairs.length, mae, floorMae, pearson: pearson(pairs), spearman: rho, range } };
}

async function main(): Promise<void> {
  const harness = await harnessSection();
  const estimator = await estimatorSection();
  const report = [`# harness 与估计器现状（${new Date().toISOString().slice(0, 10)}）`, "", harness.text, "", estimator.text, ""].join("\n");
  console.log(`\n${report}`);
  const out = path.join(EVAL_DIR, "runs", `harness-${new Date().toISOString().slice(0, 10)}.md`);
  await fs.writeFile(out, report, "utf8");
  await fs.writeFile(out.replace(/\.md$/, ".json"), JSON.stringify({ harness: harness.data, estimator: estimator.data }, null, 2) + "\n", "utf8");
  console.log(`产物：${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});

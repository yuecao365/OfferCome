import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "../src/lib/db";
import { EVAL_DIR } from "../src/lib/evals/fixtures";
import { spearman } from "../src/lib/interview/estimator";
import type { Expectation } from "../src/lib/interview/eval/expectations";
import { ABLATION_LABELS, type Ablation } from "../src/lib/interview/eval/switches";
import { parseStoredBrief } from "../src/lib/mock-interviews/brief/brief";

/**
 * 消融：关掉一个机制，跑同一批 (画像, 种子)，两档配对比。
 *
 * 三层指标，从最直接到最间接：
 * 1. 备课产出（纯代码，从 briefJson 算）：基础题数、依据分型、与领域包主题清单的重合度——机制若真起作用，这里最先看得见。
 * 2. 面试行为：行为判定通过率、每次追问的信息量、load_skill 次数、token 与成本。
 * 3. 能力估计与真值的秩相关——n 小时区间很宽，只作参考，不作结论。
 *
 * 用法：npm run ablate -- --off packs --seeds 2 --pace standard
 *      npm run ablate -- --off packs --reuse 2026-09-20   # 只按已有 run 文件重算报告，不花钱
 */

const ABLATION_FILE = path.join(EVAL_DIR, "ablation.json");
const RUNS_DIR = path.join(EVAL_DIR, "runs");

type CaseRow = {
  id: string;
  archetype: string;
  seed: number;
  sessionId: string;
  error: string | null;
  turns: number;
  abilities?: { competencyId: string; level: number }[];
  expectations?: Expectation[];
  gainPerProbe?: number | null;
  metrics?: { estimatePairs?: [number, number][]; tokens?: { input: number; cached: number; output: number; cacheRate: number }; interviewerToolCalls?: number } | null;
};

function arg(argv: string[], name: string, fallback: string): string {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "simulate", "--", ...args], { stdio: ["ignore", "inherit", "inherit"], shell: true });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`simulate 退出码 ${code}`))));
  });
}

async function readRun(tag: string): Promise<CaseRow[]> {
  const parsed = JSON.parse(await fs.readFile(path.join(RUNS_DIR, `sim-${tag}.json`), "utf8")) as { results?: CaseRow[] };
  return parsed.results ?? [];
}

/** 备课层：从 briefJson 直接算，不依赖备课时的日志。 */
async function briefMetrics(row: CaseRow) {
  const session = await prisma.mockInterviewSession.findUnique({ where: { id: row.sessionId }, select: { briefJson: true } });
  const brief = parseStoredBrief(session?.briefJson ?? null);
  if (!brief) return null;
  const quick = brief.areas.filter((area) => area.kind === "quick");
  // 曾用"基础题名与领域包主题名子串匹配"算重合度，两档都是 0%——语义相关字面不同（「预算耗尽时的收尾机制」vs「运行时循环与状态」）根本对不上。
  // 没有裁判模型就别装量化：把题名直接列出来给人看，这才是备课层真正的证据。
  return {
    quickNames: quick.map((area) => `「${area.name}」(${area.basis?.kind ?? "无"})`),
    quick: quick.length,
    basis: {
      resume: quick.filter((area) => area.basis?.kind === "resume").length,
      jd: quick.filter((area) => area.basis?.kind === "jd").length,
      gap: quick.filter((area) => area.basis?.kind === "gap").length,
      pattern: quick.filter((area) => area.basis?.kind === "pattern").length,
      none: quick.filter((area) => !area.basis).length,
    },
    scenarios: brief.areas.filter((area) => area.kind === "scenario").length,
    hypotheses: brief.hypotheses.length,
    packs: brief.skillPacks?.length ?? 0,
  };
}

async function loadSkillCount(sessionId: string): Promise<number> {
  const rows = await prisma.interviewEvent.findMany({ where: { sessionId, type: "tool_called" }, select: { payloadJson: true } });
  return rows.filter((row) => (JSON.parse(row.payloadJson) as { name?: string }).name === "load_skill").length;
}

const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);
const fmt = (value: number | null, digits = 2) => (value === null ? "—" : value.toFixed(digits));
const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(0)}%`);

function bootstrapRho(rows: CaseRow[]): { rho: number | null; ci: [number, number] | null } {
  const buckets = rows.map((row) => row.metrics?.estimatePairs ?? []).filter((pairs) => pairs.length > 0);
  const all = buckets.flat();
  const rho = spearman(all);
  if (rho === null || buckets.length < 3) return { rho, ci: null };
  let state = 7;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const draws: number[] = [];
  for (let round = 0; round < 2_000; round += 1) {
    const value = spearman(Array.from({ length: buckets.length }, () => buckets[Math.floor(random() * buckets.length)]).flat());
    if (value !== null) draws.push(value);
  }
  draws.sort((left, right) => left - right);
  return { rho, ci: draws.length === 0 ? null : [draws[Math.floor(draws.length * 0.025)], draws[Math.floor(draws.length * 0.975)]] };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const off = arg(argv, "off", "packs") as Ablation;
  // --policy script：对照档不是关某个开关，而是换成固定题本策略（不调模型）。
  const policy = arg(argv, "policy", "");
  // --on <run 文件>：基线档直接用已有的一批（同配置），只新跑对照档，省一半钱。
  const reuseOn = arg(argv, "on", "");
  const seeds = arg(argv, "seeds", "2");
  const pace = arg(argv, "pace", "standard");
  const archetypes = arg(argv, "archetypes", "solid,shaky,rambling,needy,adversarial");
  const jd = arg(argv, "jd", "tencent-hunyuan-agent-harness-engineer");
  const resume = arg(argv, "resume", "synthetic-ai-llm");
  const reuse = arg(argv, "reuse", "");
  const stamp = reuse || new Date().toISOString().slice(0, 10);
  const subject = policy ? `固定题本` : ABLATION_LABELS[off];
  const arms = policy
    ? [
        { id: "on", label: "自适应（agent）", off: [] as Ablation[], policy: "agent" },
        { id: "off", label: "固定题本", off: [] as Ablation[], policy },
      ]
    : [
        { id: "on", label: `${ABLATION_LABELS[off]}·开`, off: [] as Ablation[], policy: "agent" },
        { id: "off", label: `${ABLATION_LABELS[off]}·关`, off: [off], policy: "agent" },
      ];
  const key = policy || off;
  console.log(`对照「${subject}」：2 档 × ${archetypes.split(",").length} 画像 × ${seeds} 种子，节奏 ${pace}${reuseOn ? `；基线复用 ${reuseOn}` : ""}\n`);

  const byArm = new Map<string, CaseRow[]>();
  for (const arm of arms) {
    const tag = `ablate-${key}-${arm.id}-${stamp}`;
    if (arm.id === "on" && reuseOn) {
      const parsed = JSON.parse(await fs.readFile(path.resolve(reuseOn), "utf8")) as { results?: CaseRow[] };
      byArm.set(arm.id, parsed.results ?? []);
      console.log(`基线档复用 ${reuseOn}：${byArm.get(arm.id)!.length} 场`);
      continue;
    }
    if (!reuse) {
      if (arm.off.length === 0 && arm.policy === "agent") await fs.rm(ABLATION_FILE, { force: true });
      else await fs.writeFile(ABLATION_FILE, JSON.stringify({ off: arm.off, ...(arm.policy !== "agent" ? { policy: arm.policy } : {}) }, null, 2), "utf8");
      await new Promise((resolve) => setTimeout(resolve, 2_500)); // 服务端开关缓存 2 秒
      console.log(`
========== ${arm.label} ==========`);
      await run(["--tag", tag, "--archetypes", archetypes, "--seeds", seeds, "--pace", pace, "--jd", jd, "--resume", resume]);
    }
    byArm.set(arm.id, await readRun(tag));
    console.log(`读到 ${arm.label}：${byArm.get(arm.id)!.length} 场`);
  }
  await fs.rm(ABLATION_FILE, { force: true });

  type Summary = Record<string, string>;
  const summaries = new Map<string, Summary>();
  const perCase = new Map<string, Map<string, { gain: number | null; passed: number; total: number; names: string[] }>>();
  for (const arm of arms) {
    const rows = (byArm.get(arm.id) ?? []).filter((row) => !row.error);
    const briefs = (await Promise.all(rows.map((row) => briefMetrics(row)))).filter((item): item is NonNullable<typeof item> => item !== null);
    console.log(`${arm.label}：简报 ${briefs.length} 份已读`);
    const loads = await Promise.all(rows.map((row) => loadSkillCount(row.sessionId)));
    const expectations = rows.flatMap((row) => (row.expectations ?? []).filter((item) => item.applies && item.passed !== null));
    const { rho, ci } = bootstrapRho(rows);
    summaries.set(arm.id, {
      跑通场次: `${rows.length} / ${(byArm.get(arm.id) ?? []).length}`,
      "备课·基础题数": fmt(mean(briefs.map((item) => item.quick)), 1),
      "备课·依据 resume/jd/gap/pattern/无": briefs.length === 0 ? "—" : ["resume", "jd", "gap", "pattern", "none"].map((kind) => fmt(mean(briefs.map((item) => item.basis[kind as keyof typeof item.basis])), 1)).join(" / "),
      "备课·场景题 / 假设": `${fmt(mean(briefs.map((item) => item.scenarios)), 1)} / ${fmt(mean(briefs.map((item) => item.hypotheses)), 1)}`,
      "面试·load_skill 次数": fmt(mean(loads), 2),
      "面试·回合数": fmt(mean(rows.map((row) => row.turns)), 1),
      "面试·行为判定通过": expectations.length === 0 ? "—" : `${expectations.filter((item) => item.passed).length} / ${expectations.length}`,
      "面试·每次追问信息量": fmt(mean(rows.map((row) => row.gainPerProbe).filter((value): value is number => typeof value === "number")), 1),
      "面试·每场输入 token / 缓存": `${fmt(mean(rows.map((row) => row.metrics?.tokens?.input ?? 0)), 0)} / ${pct(mean(rows.map((row) => row.metrics?.tokens?.cacheRate ?? 0)))}`,
      "估计·秩相关 ρ（参考）": rho === null ? "—" : `${rho.toFixed(3)}${ci ? ` [${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]` : ""}（${rows.flatMap((row) => row.metrics?.estimatePairs ?? []).length} 对）`,
    });
    for (const [index, row] of rows.entries()) {
      const items = (row.expectations ?? []).filter((item) => item.applies && item.passed !== null);
      const map = perCase.get(row.id) ?? new Map();
      map.set(arm.id, { gain: typeof row.gainPerProbe === "number" ? row.gainPerProbe : null, passed: items.filter((item) => item.passed).length, total: items.length, names: briefs[index]?.quickNames ?? [] });
      perCase.set(row.id, map);
    }
  }

  // 配对：同 (画像, 种子) 两档都跑通的，逐对看差
  const pairs = [...perCase.entries()].filter(([, map]) => map.has("on") && map.has("off"));
  const sign = (pick: (item: { gain: number | null; passed: number; total: number; names: string[] }) => number | null) => {
    let up = 0, down = 0, tie = 0;
    for (const [, map] of pairs) {
      const a = pick(map.get("on")!), b = pick(map.get("off")!);
      if (a === null || b === null) continue;
      if (a > b) up += 1; else if (a < b) down += 1; else tie += 1;
    }
    return `开优 ${up} / 关优 ${down} / 平 ${tie}`;
  };

  const keys = Object.keys(summaries.get("on") ?? summaries.get("off") ?? {});
  const width = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
  const pad = (text: string, size: number) => text + " ".repeat(Math.max(0, size - width(text)));
  const w0 = Math.max(...keys.map(width), 4), w1 = Math.max(...arms.map((arm) => Math.max(width(arm.label), ...keys.map((key) => width(summaries.get(arm.id)?.[key] ?? "")))), 4);
  const lines = [`| ${pad("指标", w0)} | ${arms.map((arm) => pad(arm.label, w1)).join(" | ")} |`, `|${"-".repeat(w0 + 2)}|${arms.map(() => "-".repeat(w1 + 2)).join("|")}|`, ...keys.map((key) => `| ${pad(key, w0)} | ${arms.map((arm) => pad(summaries.get(arm.id)?.[key] ?? "—", w1)).join(" | ")} |`)];
  const paired = [`配对（同画像同种子，${pairs.length} 对）：`, `  信息量  ${sign((item) => item.gain)}`, `  判定通过数  ${sign((item) => item.passed)}`];
  // 备课层的真证据：每场的基础题名并排列出，让人看两档问的东西有没有不同。
  const names = ["", "基础题名（备课层，按场并排）：", ...pairs.map(([id, map]) => `  ${id}
    开：${map.get("on")!.names.join(" ") || "—"}
    关：${map.get("off")!.names.join(" ") || "—"}`)];

  const report = [`# 对照「${subject}」（${stamp}，节奏 ${pace}）`, "", ...lines, "", ...paired, ...names, ""].join("\n");
  console.log(`\n${report}`);
  const out = path.join(RUNS_DIR, `ablation-${key}-${stamp}.md`);
  await fs.writeFile(out, report, "utf8");
  await fs.writeFile(out.replace(/\.md$/, ".json"), JSON.stringify({ subject: key, pace, seeds, arms, summaries: Object.fromEntries(summaries), pairs: pairs.map(([id, map]) => [id, Object.fromEntries(map)]) }, null, 2) + "\n", "utf8");
  console.log(`产物：${out}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});

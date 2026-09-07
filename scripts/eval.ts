import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { prisma } from "../src/lib/db";
import { JD_DIRECTIONS, RESUME_FIXTURES, type JdDirection, type ResumeFixture } from "../src/lib/evals/cases";
import { renderEvalMarkdown, type EvalReport } from "../src/lib/evals/report";
import { runEval, selectCases } from "../src/lib/evals/runner";

/**
 * 完整模式评测：调模型，按用例跑真实出题链并判分。
 *
 *   npm run eval                                  每个方向 1 组 JD × 2 份简历 × k=3
 *   npm run eval -- --direction backend,agent     只跑这些方向
 *   npm run eval -- --id tencent-hunyuan          只跑 id 前缀匹配的 JD（可逗号分隔）
 *   npm run eval -- --resume synthetic-backend    只配这份简历
 *   npm run eval -- --sample 3 --k 1 --limit 10   每方向 3 组、只跑 1 次、最多 10 组
 *   npm run eval -- --dry-run                     只列用例不调模型
 *   npm run eval -- --save-baseline               本次报告存为基线（src/lib/evals/baseline.json）
 *
 * 报告写到 evals/reports/<tag>.json 与 .md；有基线时报告带差值。
 */

const REPORTS_DIR = path.join(process.cwd(), "evals", "reports");
const BASELINE_PATH = path.join(process.cwd(), "src", "lib", "evals", "baseline.json");

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function listArg<T extends string>(name: string, allowed: readonly T[]): T[] | undefined {
  const value = argValue(name);
  if (!value) return undefined;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of items) {
    if (!(allowed as readonly string[]).includes(item)) {
      throw new Error(`${name} 不支持 ${item}，可选：${allowed.join(", ")}`);
    }
  }
  return items as T[];
}

function defaultTag(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `eval-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function loadBaseline(): EvalReport | null {
  const custom = argValue("--baseline");
  const file = custom ?? BASELINE_PATH;
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as EvalReport;
}

async function main(): Promise<void> {
  const options = {
    tag: argValue("--tag") ?? defaultTag(),
    k: Number(argValue("--k") ?? 3),
    directions: listArg("--direction", JD_DIRECTIONS) as JdDirection[] | undefined,
    idPrefixes: argValue("--id")?.split(",").map((item) => item.trim()).filter(Boolean),
    resumes: listArg("--resume", RESUME_FIXTURES) as ResumeFixture[] | undefined,
    samplePerDirection: argValue("--sample") !== undefined ? Number(argValue("--sample")) : argValue("--id") ? undefined : 1,
    limit: argValue("--limit") ? Number(argValue("--limit")) : undefined,
    onProgress: (message: string) => console.log(message),
  };

  const cases = selectCases(options);
  console.log(`tag=${options.tag}  用例 ${cases.length} 组 × k=${options.k} = ${cases.length * options.k} 次生成`);
  for (const kase of cases) console.log(`  - ${kase.id} (${kase.jd.direction})`);
  if (hasFlag("--dry-run")) return;

  const report = await runEval(options);
  const baseline = loadBaseline();
  const markdown = renderEvalMarkdown(report, baseline);

  mkdirSync(REPORTS_DIR, { recursive: true });
  const jsonPath = path.join(REPORTS_DIR, `${report.tag}.json`);
  const mdPath = path.join(REPORTS_DIR, `${report.tag}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, markdown);
  if (hasFlag("--save-baseline")) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2));
    console.log(`基线已更新：${BASELINE_PATH}`);
  }

  console.log(`\n${markdown}`);
  console.log(`报告：${mdPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

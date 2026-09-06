import process from "node:process";

import { prisma } from "../src/lib/db";
import { assembleGenerationRecords } from "../src/lib/evals/assemble";
import { gradeGeneration } from "../src/lib/evals/generation-graders";
import { summarizeVerdicts, type GraderVerdict } from "../src/lib/evals/types";

/**
 * 重放模式：对库里已有的出题记录跑代码判分器，不调模型。
 *   npm run eval:replay                 全部记录
 *   npm run eval:replay -- <runId前缀>  只看一条，逐判分器打印说明
 */

const MARK: Record<GraderVerdict["status"], string> = { pass: "✓", fail: "✗", skip: "·" };

async function main(): Promise<void> {
  const filter = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const rows = await prisma.agentRun.findMany({ orderBy: { createdAt: "asc" } });
  const records = assembleGenerationRecords(rows).filter(
    (record) => !filter || record.runId.startsWith(filter),
  );
  if (records.length === 0) {
    console.log("没有出题记录。跑一场模拟面试后再来看。");
    return;
  }

  const createdAt = new Map(rows.map((row) => [row.runId, row.createdAt]));
  const graderNames = gradeGeneration(records[0]).map((verdict) => verdict.grader);
  const tally = new Map<string, Map<string, { pass: number; fail: number; skip: number }>>();

  for (const record of records) {
    const verdicts = gradeGeneration(record);
    const summary = summarizeVerdicts(verdicts);
    const version = record.promptVersion ?? "-";
    const versionTally = tally.get(version) ?? new Map();
    for (const verdict of verdicts) {
      const counts = versionTally.get(verdict.grader) ?? { pass: 0, fail: 0, skip: 0 };
      counts[verdict.status] += 1;
      versionTally.set(verdict.grader, counts);
    }
    const all = versionTally.get("__all__") ?? { pass: 0, fail: 0, skip: 0 };
    all[summary.pass ? "pass" : "fail"] += 1;
    versionTally.set("__all__", all);
    tally.set(version, versionTally);

    console.log(
      `${createdAt.get(record.runId)?.toISOString() ?? ""}  ${record.runId.slice(0, 8)}  ` +
        `${version.padEnd(28)} ${(record.model ?? "-").padEnd(14)} ` +
        `${verdicts.map((v) => MARK[v.status]).join("")}  ` +
        `${summary.pass ? "PASS" : "FAIL " + summary.failed.join(",")}  ` +
        `${record.totalTokens} tok ${record.durationMs} ms`,
    );
    if (filter) {
      for (const verdict of verdicts) {
        console.log(`   ${MARK[verdict.status]} ${verdict.grader.padEnd(26)} ${verdict.detail}`);
      }
    }
  }

  console.log(`\n判分器顺序：${graderNames.join(" ")}\n`);
  for (const [version, versionTally] of tally) {
    const all = versionTally.get("__all__")!;
    console.log(`== ${version}: ${all.pass}/${all.pass + all.fail} 全过`);
    for (const name of graderNames) {
      const counts = versionTally.get(name)!;
      console.log(
        `   ${name.padEnd(26)} pass ${counts.pass}  fail ${counts.fail}  skip ${counts.skip}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import process from "node:process";

import { prisma } from "../src/lib/db";
import { loadCandidateDossier } from "../src/lib/interview/dossier";
import { estimate } from "../src/lib/interview/estimator";
import { priorsFrom } from "../src/lib/interview/memory";
import { recallCandidateMemory } from "../src/lib/interview/memory-recall";
import { competenciesOf } from "../src/lib/mock-interviews/context";

/**
 * 打印一份简历的跨场记忆：候选人档案（最新一版全文与改动）与由上几场折成的能力先验（零模型调用）：
 *   npm run recall -- <resumeId> [--include-eval]
 * 没给 resumeId 就列出有已完成场次的简历；--include-eval 连评测场次一起算（核对评测产物用）。
 */
async function main() {
  const includeEval = process.argv.includes("--include-eval");
  const resumeId = process.argv.slice(2).find((item) => !item.startsWith("--"));
  if (!resumeId) {
    const rows = await prisma.mockInterviewSession.groupBy({ by: ["resumeId"], where: { status: "completed", ...(includeEval ? {} : { interview: { evalTag: null } }) }, _count: true });
    for (const row of rows) console.log(`${row.resumeId ?? "-"}：${row._count} 场`);
    return;
  }
  const dossier = await loadCandidateDossier(resumeId, { includeEval });
  if (dossier) {
    console.log(`候选人档案 第 ${dossier.version} 版（改动：${dossier.changes}）\n${dossier.body}\n`);
  } else {
    console.log("还没有候选人档案（第一场交卷后才有）。\n");
  }
  const memory = await recallCandidateMemory({ resumeId, includeEval });
  console.log(`能力先验来自 ${memory.sessions} 场，${memory.competencies.length} 条估计`);
  const latest = await prisma.mockInterviewSession.findFirst({ where: { resumeId, status: "completed", ...(includeEval ? {} : { interview: { evalTag: null } }) }, orderBy: { completedAt: "desc" }, select: { contextSnapshotJson: true } });
  if (latest) {
    console.log("跨场先验后的起点：");
    for (const item of estimate(competenciesOf(latest.contextSnapshotJson), [], priorsFrom(memory))) {
      if (item.confidence > 0) console.log(`  ${item.name}：估计 ${item.mean.toFixed(2)}，置信 ${item.confidence.toFixed(2)}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

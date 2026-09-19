import process from "node:process";

import { prisma } from "../src/lib/db";
import { loadCandidateDossier } from "../src/lib/interview/dossier";

/**
 * 打印一份简历的候选人档案（最新一版全文与改动；零模型调用）：
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
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

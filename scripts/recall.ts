import process from "node:process";

import { prisma } from "../src/lib/db";
import { estimate } from "../src/lib/interview/estimator";
import { claimHistory, historyLabel, priorsFrom } from "../src/lib/interview/memory";
import { recallCandidateMemory } from "../src/lib/interview/memory-recall";
import { parseStoredBrief } from "../src/lib/mock-interviews/brief/brief";
import { competenciesOf } from "../src/lib/mock-interviews/context";

/**
 * 打印一份简历的语义记忆、由它折成的跨场先验，以及最近一场简报里说法的历史（零模型调用）：
 *   npm run recall -- <resumeId> [--include-eval]
 * 没给 resumeId 就列出有已完成场次的简历；--include-eval 连评测场次一起算（核对新格式的产物用）。
 */
async function main() {
  const includeEval = process.argv.includes("--include-eval");
  const resumeId = process.argv.slice(2).find((item) => !item.startsWith("--"));
  if (!resumeId) {
    const rows = await prisma.mockInterviewSession.groupBy({ by: ["resumeId"], where: { status: "completed", ...(includeEval ? {} : { interview: { evalTag: null } }) }, _count: true });
    for (const row of rows) console.log(`${row.resumeId ?? "-"}：${row._count} 场`);
    return;
  }
  const memory = await recallCandidateMemory({ resumeId, includeEval });
  console.log(`记忆：${memory.sessions} 场，说法 ${memory.claims.length} 条，能力估计 ${memory.competencies.length} 条，短板 ${memory.weaknesses.length} 条，问过 ${memory.askedQuestions.length} 题`);
  const latest = await prisma.mockInterviewSession.findFirst({ where: { resumeId, status: "completed", ...(includeEval ? {} : { interview: { evalTag: null } }) }, orderBy: { completedAt: "desc" }, select: { briefJson: true, contextSnapshotJson: true } });
  const brief = latest ? parseStoredBrief(latest.briefJson) : null;
  if (brief) {
    console.log("\n最近一场简报里说法的历史：");
    for (const history of claimHistory(brief.hypotheses, memory)) {
      const hypothesis = brief.hypotheses.find((item) => item.id === history.hypothesisId)!;
      console.log(`  「${hypothesis.evidence.slice(0, 40)}」→ ${historyLabel(history)}`);
    }
    console.log("\n跨场先验后的起点：");
    for (const item of estimate(competenciesOf(latest!.contextSnapshotJson), [], priorsFrom(memory))) {
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

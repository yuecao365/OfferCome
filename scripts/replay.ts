import process from "node:process";

import { prisma } from "../src/lib/db";
import { loadSessionFacts, transcriptParity } from "../src/lib/interview/eval/facts";
import { sessionMetrics } from "../src/lib/interview/eval/metrics";
import { transcriptOf } from "../src/lib/interview/events";

/**
 * 重放一场：从事件日志重建逐字稿、与消息表对账、算指标。不调模型。
 * 用法：npm run replay -- <sessionId> [--transcript]
 */
async function main() {
  const [sessionId, ...flags] = process.argv.slice(2);
  if (!sessionId) throw new Error("用法：npm run replay -- <sessionId> [--transcript]");
  const facts = await loadSessionFacts(sessionId);
  const parity = await transcriptParity(sessionId);
  console.log(`事件 ${facts.events.length} 条，逐字稿 ${parity.eventLines} 句，消息表 ${parity.messageRows} 行${parity.mismatches.length === 0 ? "，对账一致" : "，不一致："}`);
  for (const line of parity.mismatches) console.log("  ", line);
  if (flags.includes("--transcript")) {
    for (const line of transcriptOf(facts.events)) console.log(`[${line.seq}] ${line.role === "interviewer" ? "面试官" : "候选人"}${line.kind ? `/${line.kind}` : ""}${line.control ? `(${line.control})` : ""}: ${line.content.replace(/\s+/g, " ").slice(0, 160)}`);
  }
  console.log(JSON.stringify(sessionMetrics(facts), null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

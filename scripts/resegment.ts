import process from "node:process";

import { prisma } from "../src/lib/db";
import { resegment } from "../src/lib/interview/aftermath";

/**
 * 用当前版本的整理员重切已结束会话的段（改了整理员提示词或修复逻辑之后，对旧场次重跑；旧段与题目会被替换）：
 *   npm run resegment -- <sessionId> [<sessionId> ...]
 */
async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error("用法：npm run resegment -- <sessionId> [...]");
  for (const sessionId of ids) {
    const count = await resegment(sessionId);
    const threads = await prisma.interviewThread.findMany({ where: { sessionId }, orderBy: { startSeq: "asc" }, select: { startSeq: true, kind: true, areaId: true, label: true } });
    console.log(`${sessionId}：${count} 段`);
    for (const thread of threads) console.log(`  [${thread.startSeq}] ${thread.kind} ${thread.areaId ?? "-"} ${thread.label}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

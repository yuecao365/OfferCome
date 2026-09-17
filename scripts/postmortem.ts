import process from "node:process";

import { prisma } from "../src/lib/db";
import { parseEventRow, type InterviewEvent } from "../src/lib/interview/events";
import { postmortem, VIOLATION_LABELS } from "../src/lib/interview/eval/postmortem";
import { briefReady, parseStoredBrief } from "../src/lib/mock-interviews/brief/brief";
import { competenciesOf } from "../src/lib/mock-interviews/context";

/**
 * 一场面试的自动复盘（零模型调用）：备课备好了没、候选人的行为分类、面试官违反准则的回合、底线次数、归因。
 *   npm run postmortem -- <sessionId> [<sessionId> ...]
 * 新失败先在这里露出来，再进 docs/interview-failures.md。
 */
async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error("用法：npm run postmortem -- <sessionId> [...]");
  for (const sessionId of ids) {
    const session = await prisma.mockInterviewSession.findUniqueOrThrow({ where: { id: sessionId }, include: { events: { orderBy: { seq: "asc" } }, interview: { select: { companyName: true, jobTitle: true } } } });
    const brief = parseStoredBrief(session.briefJson);
    const events = session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
    const ready = brief ? briefReady({ competencies: competenciesOf(session.contextSnapshotJson) }, brief) : false;
    const result = postmortem({ events, brief, ready });
    console.log(`\n${session.interview.companyName} · ${session.interview.jobTitle}（${sessionId}，${session.status}）`);
    console.log(`  备课：${result.ready ? "备好了" : "没备好"}；回答：正常 ${result.replies.normal}、求助 ${result.replies.help}、答不上 ${result.replies.dont_know}、不是我做的 ${result.replies.not_mine}、不作答 ${result.replies.non_answer}、跳过 ${result.replies.skip}、超长 ${result.replies.long}；底线 / 接话 ${result.guards.length} 次`);
    for (const item of result.violations) console.log(`  [${item.seq}] ${VIOLATION_LABELS[item.rule]}：${item.text.replace(/\s+/g, " ").slice(0, 80)}`);
    for (const item of result.guards) console.log(`  [${item.seq}] 底线「${item.reason}」${item.original ? `，原话：${item.original.replace(/\s+/g, " ").slice(0, 80)}` : ""}`);
    console.log(`  归因：${result.summary.join("；")}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

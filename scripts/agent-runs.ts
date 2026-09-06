import process from "node:process";

import {
  getAgentRunChain,
  listRecentAgentRuns,
} from "../src/lib/ai/agent-run-store";
import { prisma } from "../src/lib/db";

/**
 * 查看 agent 运行记录。
 *   npm run agent:runs                 最近 50 条
 *   npm run agent:runs -- <runId>      某次生成的完整链路，含 payload/output 预览
 *   npm run agent:runs -- --agent job_blueprint --status failed
 */

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function preview(json: string | null, length = 160): string {
  if (!json) return "-";
  return json.length > length ? `${json.slice(0, length)}…(${json.length} chars)` : json;
}

async function main(): Promise<void> {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const runId = positional[0];

  if (runId) {
    const chain = await getAgentRunChain(runId);
    if (chain.length === 0) {
      console.log(`没有 runId=${runId} 的记录。`);
      return;
    }
    for (const run of chain) {
      console.log(
        `\n[${run.createdAt.toISOString()}] ${run.agent} · ${run.event} · ${run.status}` +
          `  ${run.model}  ${run.durationMs}ms  tokens=${run.totalTokens ?? "-"}` +
          (run.errorKind ? `  error=${run.errorKind}` : ""),
      );
      if (run.metricsJson) console.log(`  metrics: ${run.metricsJson}`);
      console.log(`  payload: ${preview(run.payloadJson)}`);
      console.log(`  output:  ${preview(run.outputJson, 400)}`);
      if (run.status !== "success" && run.rawText) {
        console.log(`  rawText: ${preview(run.rawText, 400)}`);
      }
    }
    return;
  }

  const runs = await listRecentAgentRuns({
    agent: argValue("--agent"),
    status: argValue("--status"),
    limit: Number(argValue("--limit") ?? 50),
  });
  for (const run of runs) {
    console.log(
      `${run.createdAt.toISOString()}  ${run.runId.slice(0, 8)}  ` +
        `${run.agent.padEnd(26)} ${run.event.padEnd(10)} ${run.status.padEnd(7)} ` +
        `${run.model.padEnd(14)} ${String(run.durationMs).padStart(6)}ms ` +
        `${String(run.totalTokens ?? "-").padStart(6)}` +
        (run.errorKind ? `  ${run.errorKind}` : "") +
        (run.metricsJson ? `  ${run.metricsJson}` : ""),
    );
  }
  if (runs.length === 0) console.log("还没有记录。跑一场模拟面试后再来看。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

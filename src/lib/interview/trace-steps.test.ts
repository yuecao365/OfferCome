import assert from "node:assert/strict";
import test from "node:test";

import { agentChainsOf, traceStepOf, turnBoundary, type AgentRunRow } from "./trace-steps";

/** trace 按步查看（G6）：AgentRun 行 → 步（输入片段、输出片段、工具）；按 runId 归链；从事件日志找某回合的边界。 */

const row = (overrides: Partial<AgentRunRow>): AgentRunRow => ({ runId: "r", agent: "question_evaluation", event: "model_call", status: "success", durationMs: 100, totalTokens: 10, cachedTokens: 0, errorKind: null, metricsJson: null, payloadJson: null, outputJson: null, rawText: null, systemText: null, createdAt: new Date("2026-09-16T00:00:00Z"), ...overrides });

test("步：模型调用取消息列表的最后一条当输入片段、原始文本当输出；工具行带工具名 / 档位 / 入参 / 成败；长文本截断", () => {
  const call = traceStepOf(row({ payloadJson: JSON.stringify([{ role: "user", content: "候选人的话" }, { role: "user", content: "[现场卡]\n进度" }]), rawText: `{"say":"${"问".repeat(700)}"}` }));
  assert.equal(call.input, "共 2 条消息；最后一条（user）：[现场卡]\n进度");
  assert.ok(call.output!.endsWith("…") && call.output!.length === 601);
  assert.equal(call.tool, null);
  const tool = traceStepOf(row({ event: "tool_result", status: "failed", payloadJson: JSON.stringify({ tool: "lookup_resume", access: "read", input: { keyword: "P95" } }), outputJson: JSON.stringify({ lines: [] }), metricsJson: JSON.stringify({ step: 1 }) }));
  assert.deepEqual(tool.tool, { name: "lookup_resume", access: "read", input: '{"keyword":"P95"}', ok: false });
  assert.equal(tool.output, '{"lines":[]}');
  assert.deepEqual(tool.metrics, { step: 1 });
  assert.equal(traceStepOf(row({ payloadJson: JSON.stringify({ question: "q" }) })).input, '{"question":"q"}');
});

test("链：同一 runId 的行按时间归成一条链，状态取最差，开销只算模型调用行", () => {
  const rows = [
    row({ runId: "eval:q1", event: "model_call", status: "partial", durationMs: 900, totalTokens: 4_000, createdAt: new Date("2026-09-16T00:00:03Z") }),
    row({ runId: "eval:q1", event: "step", durationMs: 400, totalTokens: 2_000, createdAt: new Date("2026-09-16T00:00:01Z") }),
    row({ runId: "eval:q1", event: "tool_result", durationMs: 5, totalTokens: null, createdAt: new Date("2026-09-16T00:00:02Z") }),
    row({ runId: "dossier:s", agent: "candidate_dossier", durationMs: 300, totalTokens: 1_000 }),
  ];
  const chains = agentChainsOf(rows);
  assert.deepEqual(chains.map((chain) => [chain.runId, chain.label, chain.status, chain.durationMs, chain.totalTokens, chain.steps.map((step) => step.event)]), [
    ["eval:q1", "评分", "partial", 900, 4_000, ["step", "tool_result", "model_call"]],
    ["dossier:s", "候选人档案", "success", 300, 1_000, ["model_call"]],
  ]);
});

test("回合边界：第 n 个面试官发言之前是状态，它前面的候选人发言是输入；开场没有候选人；找不到返回 null", () => {
  const events = [{ type: "move_decided" }, { type: "interviewer_said" }, { type: "candidate_said" }, { type: "move_decided" }, { type: "tool_called" }, { type: "interviewer_said" }, { type: "notebook_written" }, { type: "candidate_said" }, { type: "interviewer_said" }];
  assert.deepEqual(turnBoundary(events, 0), { prefixEnd: 1, candidateIndex: null });
  assert.deepEqual(turnBoundary(events, 1), { prefixEnd: 2, candidateIndex: 2 });
  assert.deepEqual(turnBoundary(events, 2), { prefixEnd: 7, candidateIndex: 7 });
  assert.equal(turnBoundary(events, 3), null);
});

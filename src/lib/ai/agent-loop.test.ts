import assert from "node:assert/strict";
import test from "node:test";

import { tool } from "ai";
import { z } from "zod";

import { messagesOf, runLoop, type LoopEvent, type LoopToolSet, type StepResult } from "./agent-loop";

/** 通用循环（G1）：状态是事件的投影；预算超了写事件再给一步结论；工具三档；hook 能拒绝；挂起后喂回事件续跑。 */

const usage = (totalTokens: number) => ({ inputTokens: totalTokens - 5, inputTokenDetails: { noCacheTokens: totalTokens - 5, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokens: 5, outputTokenDetails: { textTokens: 5, reasoningTokens: undefined }, totalTokens });
const answer = (text: string, totalTokens = 100): StepResult => ({ text, toolCalls: [], finishReason: "stop", usage: usage(totalTokens) });
const call = (id: string, toolName: string, input: unknown, totalTokens = 100): StepResult => ({ text: "", toolCalls: [{ toolCallId: id, toolName, input }], finishReason: "tool-calls", usage: usage(totalTokens) });

function tools(log: string[] = []): LoopToolSet {
  return {
    lookup: { access: "read", ...tool({ description: "查", inputSchema: z.object({ q: z.string() }), execute: async ({ q }) => { log.push(`lookup:${q}`); return { hit: q.toUpperCase() }; } }) },
    write_note: { access: "write", ...tool({ description: "写", inputSchema: z.object({ text: z.string() }), execute: async ({ text }) => { log.push(`write:${text}`); return "ok"; } }) },
    deploy: { access: "confirm", ...tool({ description: "部署", inputSchema: z.object({ env: z.string() }), execute: async ({ env }) => { log.push(`deploy:${env}`); return "deployed"; } }) },
    broken: { access: "read", ...tool({ description: "坏", inputSchema: z.object({}), execute: async (): Promise<string> => { throw new Error("boom"); } }) },
  };
}

/** 按步返回预设结果，并记下每步看到的消息与 toolChoice。 */
function scripted(results: StepResult[]) {
  const seen: { toolChoice: "auto" | "none"; messages: ReturnType<typeof messagesOf> }[] = [];
  const callStep = async (messages: ReturnType<typeof messagesOf>, toolChoice: "auto" | "none") => {
    seen.push({ toolChoice, messages });
    return results[Math.min(seen.length - 1, results.length - 1)];
  };
  return { callStep, seen };
}

test("没有工具：一步就完；有工具：调用 → 结果回到消息里 → 再调模型；读档自动放行、写档照跑但事件里带档位", async () => {
  const plain = scripted([answer("done")]);
  const single = await runLoop({ prompt: "q", tools: {}, budget: { maxSteps: 3 }, callStep: plain.callStep });
  assert.equal(single.status, "done");
  assert.equal(single.steps, 1);
  assert.equal(plain.seen[0].toolChoice, "none", "没有工具的循环不给模型工具选项");

  const log: string[] = [];
  const script = scripted([call("c1", "lookup", { q: "abc" }), call("c2", "write_note", { text: "n" }), answer("final")]);
  const result = await runLoop({ prompt: "q", tools: tools(log), budget: { maxSteps: 3 }, callStep: script.callStep });
  assert.equal(result.status, "done");
  assert.equal(result.status === "done" && result.final.text, "final");
  assert.equal(result.steps, 3);
  assert.deepEqual(log, ["lookup:abc", "write:n"]);
  assert.deepEqual(result.toolCalls.map((item) => item.toolName), ["lookup", "write_note"]);
  assert.deepEqual(result.events.filter((event) => event.type === "tool_result").map((event) => event.type === "tool_result" && [event.access, event.ok, event.output]), [["read", true, { hit: "ABC" }], ["write", true, "ok"]]);
  // 第二步看到的消息：用户输入、助手的工具调用、工具结果。
  const second = script.seen[1].messages;
  assert.deepEqual(second.map((message) => message.role), ["user", "assistant", "tool"]);
  assert.deepEqual(second[2].content, [{ type: "tool-result", toolCallId: "c1", toolName: "lookup", output: { type: "json", value: { hit: "ABC" } } }]);
  assert.deepEqual(script.seen.map((item) => item.toolChoice), ["auto", "auto", "auto"]);
});

test("预算：步数 / token / 时长任一超了写 budget_exceeded，再给一步不许调工具的结论；这步即使又想调工具也不执行", async () => {
  const log: string[] = [];
  const script = scripted([call("c1", "lookup", { q: "a" }), call("c2", "lookup", { q: "b" }), call("c3", "lookup", { q: "c" })]);
  const result = await runLoop({ prompt: "q", tools: tools(log), budget: { maxSteps: 2 }, callStep: script.callStep });
  assert.equal(result.status, "done");
  assert.equal(result.steps, 3, "两步工具 + 一步结论");
  assert.deepEqual(log, ["lookup:a", "lookup:b"]);
  const over = result.events.find((event) => event.type === "budget_exceeded");
  assert.deepEqual(over, { type: "budget_exceeded", step: 2, limit: "steps", used: 2, max: 2 });
  assert.equal(script.seen[2].toolChoice, "none");
  assert.equal(result.toolCalls.length, 2, "结论那步的工具调用不算数");

  const tokens = scripted([call("c1", "lookup", { q: "a" }, 900), call("c2", "lookup", { q: "b" }, 900), answer("x")]);
  const byTokens = await runLoop({ prompt: "q", tools: tools(), budget: { maxSteps: 9, maxTokens: 1_000 }, callStep: tokens.callStep });
  assert.equal(byTokens.events.some((event) => event.type === "budget_exceeded" && event.limit === "tokens" && event.used === 1_800), true);
  assert.equal(byTokens.steps, 3, "两步用了 1800 token，第三步是结论");
});

test("hook：beforeTool 能拒绝（原因作为工具结果回给模型）；未知工具与执行抛错都变成失败的工具结果，循环不断", async () => {
  const log: string[] = [];
  const script = scripted([call("c1", "write_note", { text: "n" }), call("c2", "nope", {}), call("c3", "broken", {}), answer("end")]);
  const events: LoopEvent[] = [];
  const result = await runLoop({
    prompt: "q",
    tools: tools(log),
    budget: { maxSteps: 5 },
    hooks: { beforeTool: (call, access) => (access === "write" ? { allow: false, reason: "评测里不许写" } : undefined), onEvent: (event) => events.push(event) },
    callStep: script.callStep,
  });
  assert.equal(result.status, "done");
  assert.deepEqual(log, [], "写档被 hook 拒绝，没执行");
  const results = result.events.flatMap((event) => (event.type === "tool_result" ? [[event.ok, String(event.output)]] : []));
  assert.deepEqual(results, [[false, "这次调用被拒绝：评测里不许写"], [false, "未知工具 nope，可用：lookup, write_note, deploy, broken"], [false, "工具执行失败：boom"]]);
  assert.equal(events.length, result.events.length, "onEvent 看到每个事件");
});

test("confirm 档：没有批准就挂起（interrupted），把事件喂回来并给决定即续跑；拒绝时模型收到拒绝的结果；同一步其它调用照常", async () => {
  const log: string[] = [];
  const first = scripted([call("c1", "deploy", { env: "prod" }), answer("after")]);
  const paused = await runLoop({ prompt: "q", tools: tools(log), budget: { maxSteps: 3 }, callStep: first.callStep });
  assert.equal(paused.status, "interrupted");
  assert.deepEqual(paused.status === "interrupted" && paused.pending, { toolCallId: "c1", toolName: "deploy", input: { env: "prod" } });
  assert.deepEqual(log, []);
  assert.equal(paused.events.at(-1)?.type, "interrupted");

  const approved = scripted([answer("after")]);
  const resumed = await runLoop({ prompt: "q", tools: tools(log), budget: { maxSteps: 3 }, callStep: approved.callStep, resume: { events: paused.events, decision: { toolCallId: "c1", approved: true } } });
  assert.equal(resumed.status, "done");
  assert.deepEqual(log, ["deploy:prod"]);
  assert.equal(resumed.steps, 2, "续跑不重跑挂起前的那一步");
  assert.deepEqual(resumed.events.filter((event) => event.type === "resumed").map((event) => event.type === "resumed" && event.approved), [true]);
  assert.deepEqual(approved.seen[0].messages.map((message) => message.role), ["user", "assistant", "tool"]);

  const denied = scripted([answer("after-deny")]);
  const declined = await runLoop({ prompt: "q", tools: tools(log), budget: { maxSteps: 3 }, callStep: denied.callStep, resume: { events: paused.events, decision: { toolCallId: "c1", approved: false } } });
  assert.equal(declined.status, "done");
  assert.deepEqual(log, ["deploy:prod"], "拒绝的不执行");
  const deniedResult = declined.events.find((event) => event.type === "tool_result" && event.call.toolCallId === "c1");
  assert.equal(deniedResult?.type === "tool_result" && deniedResult.ok, false);
  assert.match(String(deniedResult?.type === "tool_result" && deniedResult.output), /拒绝/);
});

test("投影：只喂事件不喂决定也能从中断处续跑（上一步没跑完的调用先跑完）", async () => {
  const log: string[] = [];
  const crashedEvents: LoopEvent[] = [
    { type: "step_started", step: 1, toolChoice: "auto" },
    { type: "step_finished", step: 1, text: "", toolCalls: [{ toolCallId: "a", toolName: "lookup", input: { q: "x" } }, { toolCallId: "b", toolName: "lookup", input: { q: "y" } }], finishReason: "tool-calls", usage: usage(50), durationMs: 5 },
    { type: "tool_called", step: 1, call: { toolCallId: "a", toolName: "lookup", input: { q: "x" } }, access: "read" },
    { type: "tool_result", step: 1, call: { toolCallId: "a", toolName: "lookup", input: { q: "x" } }, access: "read", ok: true, output: { hit: "X" }, durationMs: 1 },
  ];
  const script = scripted([answer("recovered")]);
  const result = await runLoop({ prompt: "q", tools: tools(log), budget: { maxSteps: 3 }, callStep: script.callStep, resume: { events: crashedEvents } });
  assert.equal(result.status, "done");
  assert.deepEqual(log, ["lookup:y"], "只补跑没结果的那次调用");
  const messages = script.seen[0].messages;
  assert.equal(messages.length, 3);
  assert.equal((messages[2].content as unknown[]).length, 2, "两个工具结果合在一条 tool 消息里");
});

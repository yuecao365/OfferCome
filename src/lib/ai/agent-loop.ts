import type { LanguageModelUsage, ModelMessage, Tool, ToolSet } from "ai";

/**
 * 通用 agent 循环（深度扩展 G1）：一次"调模型 → 执行工具 → 再调模型"的循环，由代码掌握，不交给 SDK 的 stopWhen。
 *
 * - 状态是事件的投影：循环不单独存消息列表，每一步都从事件重放出消息；所以从任一步续跑就是"把事件喂回来"。
 * - 预算超了不抛错：写 budget_exceeded 事件，再给模型一步"不许调工具、直接给结论"。
 * - 工具三档：read 自动放行；write 照跑但事件里带档位（审计按它查）；confirm 没有批准就挂起（interrupted），批准后续跑。
 * - hook 是纯函数：beforeTool 能拒绝一次调用（拒绝的原因作为工具结果回给模型），afterTool / onEvent 只观察。
 * 这里不依赖 AI SDK 的调用细节：模型怎么调由调用方的 callStep 决定（runAgent 用 generateText + 结构化输出）。
 */

export type ToolAccess = "read" | "write" | "confirm";
export type LoopTool = Tool & { access: ToolAccess };
export type LoopToolSet = Record<string, LoopTool>;

export type ToolCall = { toolCallId: string; toolName: string; input: unknown };
export type ToolOutcome = { ok: boolean; output: unknown; durationMs: number };

export type StepResult = {
  text: string;
  toolCalls: ToolCall[];
  finishReason?: string;
  usage?: LanguageModelUsage;
};

export type LoopEvent =
  | { type: "step_started"; step: number; toolChoice: "auto" | "none" }
  | { type: "step_finished"; step: number; text: string; toolCalls: ToolCall[]; finishReason?: string; usage?: LanguageModelUsage; durationMs: number }
  | { type: "tool_called"; step: number; call: ToolCall; access: ToolAccess }
  | { type: "tool_result"; step: number; call: ToolCall; access: ToolAccess; ok: boolean; output: unknown; durationMs: number }
  | { type: "budget_exceeded"; step: number; limit: "steps" | "tokens" | "duration"; used: number; max: number }
  | { type: "interrupted"; step: number; call: ToolCall }
  | { type: "resumed"; step: number; call: ToolCall; approved: boolean };

export type Budget = {
  /** 允许调工具的步数；到了就再给一步"直接给结论"。没有工具时循环只有一步。 */
  maxSteps: number;
  maxTokens?: number;
  maxDurationMs?: number;
};

export type LoopHooks = {
  beforeTool?: (call: ToolCall, access: ToolAccess) => { allow: false; reason: string } | { allow: true } | void;
  afterTool?: (call: ToolCall, outcome: ToolOutcome) => void;
  onEvent?: (event: LoopEvent) => void;
};

export type LoopResume = {
  events: LoopEvent[];
  /** 对挂起那次 confirm 调用的决定；没有就只是从上次停的地方接着跑。 */
  decision?: { toolCallId: string; approved: boolean };
};

export type LoopOptions = {
  /** 第一条用户消息（agent 的输入）。 */
  prompt: string;
  tools: LoopToolSet;
  budget: Budget;
  hooks?: LoopHooks;
  /** 调一次模型：消息是从事件投影出来的；toolChoice none 表示这一步不许调工具。 */
  callStep: (messages: ModelMessage[], toolChoice: "auto" | "none") => Promise<StepResult>;
  resume?: LoopResume;
};

export type LoopResult =
  | { status: "done"; final: StepResult; steps: number; events: LoopEvent[]; toolCalls: ToolCall[] }
  | { status: "interrupted"; pending: ToolCall; steps: number; events: LoopEvent[]; toolCalls: ToolCall[] };

/** 事件 → 消息列表：用户输入，之后每一步是"助手（正文 + 工具调用）+ 工具结果"。这是循环唯一的状态来源。 */
export function messagesOf(prompt: string, events: LoopEvent[]): ModelMessage[] {
  const messages: ModelMessage[] = [{ role: "user", content: prompt }];
  for (const event of events) {
    if (event.type === "step_finished" && event.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: [
          ...(event.text ? [{ type: "text" as const, text: event.text }] : []),
          ...event.toolCalls.map((call) => ({ type: "tool-call" as const, toolCallId: call.toolCallId, toolName: call.toolName, input: call.input })),
        ],
      });
    }
    if (event.type === "tool_result") {
      const value = typeof event.output === "string" ? { type: "text" as const, value: event.output } : { type: "json" as const, value: toJsonValue(event.output) };
      const last = messages[messages.length - 1];
      const part = { type: "tool-result" as const, toolCallId: event.call.toolCallId, toolName: event.call.toolName, output: value };
      if (last?.role === "tool") (last.content as unknown[]).push(part);
      else messages.push({ role: "tool", content: [part] });
    }
  }
  return messages;
}

function toJsonValue(value: unknown): never {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

export function toolCallsOf(events: LoopEvent[]): ToolCall[] {
  return events.flatMap((event) => (event.type === "tool_called" ? [event.call] : []));
}

export function stepsOf(events: LoopEvent[]): number {
  return events.filter((event) => event.type === "step_started").length;
}

function tokensOf(events: LoopEvent[]): number {
  return events.reduce((sum, event) => sum + (event.type === "step_finished" ? (event.usage?.totalTokens ?? 0) : 0), 0);
}

function durationOf(events: LoopEvent[]): number {
  return events.reduce((sum, event) => sum + (event.type === "step_finished" || event.type === "tool_result" ? event.durationMs : 0), 0);
}

function exceeded(budget: Budget, events: LoopEvent[]): Extract<LoopEvent, { type: "budget_exceeded" }> | null {
  const step = stepsOf(events);
  const checks: [Extract<LoopEvent, { type: "budget_exceeded" }>["limit"], number, number | undefined][] = [
    ["steps", step, budget.maxSteps],
    ["tokens", tokensOf(events), budget.maxTokens],
    ["duration", durationOf(events), budget.maxDurationMs],
  ];
  for (const [limit, used, max] of checks) {
    if (max !== undefined && used >= max) return { type: "budget_exceeded", step, limit, used, max };
  }
  return null;
}

export type ToolGate = { hooks?: LoopHooks; emit: (event: LoopEvent) => void };

/**
 * 执行一次工具调用——循环与流式回合共用的门：先记 tool_called；未知工具、hook 拒绝、执行抛错都变成失败的工具结果（循环不断）；
 * confirm 档没批准就记 interrupted 并返回 null（挂起）。
 */
export async function callTool(tools: LoopToolSet, call: ToolCall, gate: ToolGate & { step: number; approved: boolean; messages: ModelMessage[] }): Promise<ToolOutcome | null> {
  const tool = tools[call.toolName];
  const access = tool?.access ?? "read";
  gate.emit({ type: "tool_called", step: gate.step, call, access });
  const settle = (ok: boolean, output: unknown, durationMs: number): ToolOutcome => {
    const outcome = { ok, output, durationMs };
    gate.emit({ type: "tool_result", step: gate.step, call, access, ...outcome });
    gate.hooks?.afterTool?.(call, outcome);
    return outcome;
  };
  if (!tool) return settle(false, `未知工具 ${call.toolName}，可用：${Object.keys(tools).join(", ") || "无"}`, 0);
  const verdict = gate.hooks?.beforeTool?.(call, access);
  if (verdict && !verdict.allow) return settle(false, `这次调用被拒绝：${verdict.reason}`, 0);
  if (access === "confirm" && !gate.approved) {
    gate.emit({ type: "interrupted", step: gate.step, call });
    return null;
  }
  const startedAt = Date.now();
  try {
    const output = await tool.execute?.(call.input, { toolCallId: call.toolCallId, messages: gate.messages } as Parameters<NonNullable<Tool["execute"]>>[1]);
    return settle(true, output ?? null, Date.now() - startedAt);
  } catch (error) {
    return settle(false, `工具执行失败：${error instanceof Error ? error.message : String(error)}`, Date.now() - startedAt);
  }
}

/**
 * 流式回合（SDK 自己走多步，为了第一步就能往外吐字）走同一道门：工具带 execute 交给 SDK，执行时经过档位 / hook / 事件。
 * 流式回合不能挂起：confirm 档不执行，以"需要确认"作为结果回给模型。
 */
export function instrumentTools(tools: LoopToolSet, gate: ToolGate): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, loopTool]) => [
      name,
      {
        description: loopTool.description,
        inputSchema: loopTool.inputSchema,
        execute: async (input: unknown, options: { toolCallId: string; messages: ModelMessage[] }) => {
          const call: ToolCall = { toolCallId: options.toolCallId, toolName: name, input };
          if (loopTool.access === "confirm") {
            const outcome: ToolOutcome = { ok: false, output: "这个工具需要用户确认，这一回合不能等：不用它继续。", durationMs: 0 };
            gate.emit({ type: "tool_called", step: 0, call, access: "confirm" });
            gate.emit({ type: "tool_result", step: 0, call, access: "confirm", ...outcome });
            return outcome.output;
          }
          const outcome = await callTool(tools, call, { ...gate, step: 0, approved: true, messages: options.messages });
          return outcome?.output ?? null;
        },
      } as Tool,
    ]),
  );
}

export async function runLoop(options: LoopOptions): Promise<LoopResult> {
  const { tools, budget, hooks } = options;
  const events: LoopEvent[] = [...(options.resume?.events ?? [])];
  const emit = (event: LoopEvent) => {
    events.push(event);
    hooks?.onEvent?.(event);
  };
  const result = (status: "done" | "interrupted", extra: { final?: StepResult; pending?: ToolCall }): LoopResult =>
    status === "done"
      ? { status, final: extra.final!, steps: stepsOf(events), events, toolCalls: toolCallsOf(events) }
      : { status, pending: extra.pending!, steps: stepsOf(events), events, toolCalls: toolCallsOf(events) };

  /** 执行一次调用；挂起返回 null。 */
  const execute = (step: number, call: ToolCall, approved: boolean): Promise<ToolOutcome | null> =>
    callTool(tools, call, { hooks, emit, step, approved, messages: messagesOf(options.prompt, events) });

  /** 把这一步剩下没执行的调用跑完；挂起返回那次调用。 */
  const drain = async (step: number, calls: ToolCall[], decision?: LoopResume["decision"]): Promise<ToolCall | null> => {
    const settled = new Set(events.flatMap((event) => (event.type === "tool_result" ? [event.call.toolCallId] : [])));
    for (const call of calls) {
      if (settled.has(call.toolCallId)) continue;
      const approved = decision?.toolCallId === call.toolCallId ? decision.approved : false;
      if (decision?.toolCallId === call.toolCallId) {
        emit({ type: "resumed", step, call, approved });
        if (!approved) {
          emit({ type: "tool_called", step, call, access: "confirm" });
          emit({ type: "tool_result", step, call, access: "confirm", ok: false, output: "用户拒绝了这次调用，请不用它继续。", durationMs: 0 });
          continue;
        }
      }
      const outcome = await execute(step, call, approved);
      if (outcome === null) return call;
    }
    return null;
  };

  // 续跑：上次停在某一步的工具调用中间（挂起或中断），先把那一步的调用跑完。
  const lastStep = [...events].reverse().find((event): event is Extract<LoopEvent, { type: "step_finished" }> => event.type === "step_finished");
  if (lastStep && lastStep.toolCalls.length > 0) {
    const pending = await drain(lastStep.step, lastStep.toolCalls, options.resume?.decision);
    if (pending) return result("interrupted", { pending });
  }

  const hasTools = Object.keys(tools).length > 0;
  let closing = !hasTools;
  for (;;) {
    const over = !closing ? exceeded(budget, events) : null;
    if (over) {
      emit(over);
      closing = true;
    }
    const step = stepsOf(events) + 1;
    const toolChoice = closing ? "none" : "auto";
    emit({ type: "step_started", step, toolChoice });
    const startedAt = Date.now();
    const stepResult = await options.callStep(messagesOf(options.prompt, events), toolChoice);
    const toolCalls = closing ? [] : stepResult.toolCalls;
    emit({ type: "step_finished", step, text: stepResult.text, toolCalls, finishReason: stepResult.finishReason, usage: stepResult.usage, durationMs: Date.now() - startedAt });
    if (toolCalls.length === 0) return result("done", { final: stepResult });
    const pending = await drain(step, toolCalls);
    if (pending) return result("interrupted", { pending });
  }
}

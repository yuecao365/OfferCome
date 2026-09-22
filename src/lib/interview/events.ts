import { z } from "zod";

import { ACTIONS, NO_INFO_SIGNALS, SIGNALS, type Signal, type FacetRef, type StateEvent } from "./state";

/**
 * 面试的事件日志（interview-system-design.md §6.6）：一场里发生的一切，按 seq 追加写。
 * 逐字稿、线程、进度、报告、评测指标都从它推导；重放一场不调模型。
 *
 * 阶段 A（interview-refactor-plan.md）只写候选人 / 面试官说话、控制、降级、错误、结束这几类，
 * 与旧表双写；其余类型给后续阶段预留。payload 的 schema 在这里定，读写两端都用它校验。
 */

export const CANDIDATE_CONTROLS = ["hint", "skip", "repeat", "end"] as const;
export type CandidateControl = (typeof CANDIDATE_CONTROLS)[number];

/** 房间按钮只点按钮没打字时替候选人说的话。 */
/**
 * 候选人这句是什么：面试官（模型）判的 signal，按钮直接映射（跳过 / 提示与重复 = 求助 / 结束）。
 * 旧场次的 candidate_said 没有 signal，按 answered 算。复盘、切段、指标共用；没有任何正则。
 */
export type ReplyKind = Signal | "skip";

export function replyKindOf(line: Pick<TranscriptLine, "role" | "control" | "signal">): ReplyKind {
  if (line.role !== "candidate") return "answered";
  if (line.control === "skip") return "skip";
  if (line.control === "hint" || line.control === "repeat") return "help";
  if (line.control === "end") return "wants_end";
  return line.signal ?? "answered";
}

/** 这句没有信息（答不上 / 不是我做的 / 不作答）：切段判"没答上"、复盘数连续几句。 */
export function isNoInfo(line: Pick<TranscriptLine, "role" | "control" | "signal">): boolean {
  const kind = replyKindOf(line);
  return kind !== "skip" && NO_INFO_SIGNALS.has(kind);
}

export const isHelpRequest = (line: Pick<TranscriptLine, "role" | "control" | "signal">): boolean => replyKindOf(line) === "help";

export const CONTROL_PLACEHOLDERS: Record<CandidateControl, string> = {
  skip: "这题我想跳过。",
  repeat: "能再说一遍吗？",
  end: "我们结束吧。",
  hint: "这题我不太会，能给个方向吗？",
};

const said = z.object({ content: z.string() });

export const eventPayloadSchemas = {
  /** 候选人说了一句；control 是房间按钮（提示 / 跳过 / 再说一遍 / 结束），打字发的为 null。 */
  candidate_said: said.extend({
    clientId: z.string().nullable(),
    control: z.enum(CANDIDATE_CONTROLS).nullable(),
    /** 从面试官上一句到候选人发送的毫秒数；不知道为 null。 */
    composeMs: z.number().int().nonnegative().nullable(),
    /** 这句是什么（模型判，v5）；旧事件没有。 */
    signal: z.enum(SIGNALS).nullable().optional(),
  }),
  /** 面试官说了一句；kind：say（提问 / 追问）、aside（答疑：把题说具体，不占预算）、closing、fallback（代码接的话）。 */
  interviewer_said: said.extend({
    kind: z.string(),
    /** 这句聊哪份材料（材料 id，代码指派；F1–F2 是模型自报）；开场、告别为 null；旧事件没有。 */
    topic: z.string().nullable().optional(),
    /** 这句追问的角度：模型自写的一句（agent-freedom-plan §2.3）；旧事件是备课 leads 的下标。切入问法为 null。 */
    facet: z.union([z.string(), z.number().int()]).nullable().optional(),
    /** 这回合的动作与理由、候选人那句的信号（模型提、代码校验，v5）；旧事件没有。 */
    action: z.enum(ACTIONS).nullable().optional(),
    signal: z.enum(SIGNALS).nullable().optional(),
  }),
  /** 面试笔记：模型每回合整份重写的 Markdown（notes.ts）。 */
  notes_written: z.object({ content: z.string() }),
  /** 面试官查了资料（技能包 / 简历段落）。 */
  tool_called: z.object({ name: z.string(), argument: z.string().nullable() }),
  /** 模型没说出话，代码接了一句。 */
  fallback_used: z.object({ reason: z.string(), original: z.string().nullable().optional() }),
  /** 模型调用出错但回合继续（不可恢复的错误不落事件，回合本身失败）。 */
  model_error: z.object({ kind: z.string(), message: z.string() }),
  /** 面试结束：谁定的（budget / breaker 是 v5 之前的旧值）。 */
  ended: z.object({ by: z.enum(["interviewer", "candidate", "budget", "breaker"]) }),
} as const;

export type EventType = keyof typeof eventPayloadSchemas;
export const EVENT_TYPES = Object.keys(eventPayloadSchemas) as EventType[];

export type EventPayload<T extends EventType = EventType> = z.infer<(typeof eventPayloadSchemas)[T]>;

/** 待写入的事件：seq 与时间由写入器分配。 */
export type NewEvent<T extends EventType = EventType> = T extends EventType ? { type: T; payload: EventPayload<T>; runId?: string | null } : never;

/** 读出来的事件。 */
export type InterviewEvent<T extends EventType = EventType> = T extends EventType
  ? { seq: number; type: T; payload: EventPayload<T>; runId: string | null; at: Date }
  : never;

export function event<T extends EventType>(type: T, payload: EventPayload<T>, runId: string | null = null): NewEvent<T> {
  return { type, payload, runId } as NewEvent<T>;
}

/** 一行库记录 → 事件；类型不认识或 payload 不合 schema 的丢弃（返回 null），读方不因坏数据崩。 */
export function parseEventRow(row: { seq: number; type: string; payloadJson: string; runId: string | null; createdAt: Date }): InterviewEvent | null {
  const schema = (eventPayloadSchemas as Record<string, z.ZodTypeAny>)[row.type];
  if (!schema) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(row.payloadJson));
    if (!parsed.success) return null;
    return { seq: row.seq, type: row.type as EventType, payload: parsed.data, runId: row.runId, at: row.createdAt } as InterviewEvent;
  } catch {
    return null;
  }
}

/** 事务里的最小写接口：只要能查最大 seq、能建行即可，本地版是 Prisma 事务，测试里可以是内存数组。 */
export type EventSink = {
  interviewEvent: {
    aggregate: (args: { where: { sessionId: string }; _max: { seq: true } }) => Promise<{ _max: { seq: number | null } }>;
    createMany: (args: { data: { sessionId: string; seq: number; type: string; payloadJson: string; runId: string | null }[] }) => Promise<unknown>;
  };
};

/** 追加写：seq 从当前最大值往后连续分配。调用方保证同一场同一时刻只有一个写入者（回合已互斥）。 */
export async function appendEvents(sink: EventSink, sessionId: string, events: NewEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const { _max } = await sink.interviewEvent.aggregate({ where: { sessionId }, _max: { seq: true } });
  const start = (_max.seq ?? -1) + 1;
  await sink.interviewEvent.createMany({
    data: events.map((item, index) => ({ sessionId, seq: start + index, type: item.type, payloadJson: JSON.stringify(item.payload), runId: item.runId ?? null })),
  });
  return start;
}

/** at：这句落下的时刻（事件的 createdAt），纯逻辑测试可以不带。topic / facet 见 interviewer_said。 */
export type TranscriptLine = { seq: number; role: "interviewer" | "candidate"; content: string; kind: string | null; control: CandidateControl | null; at?: Date; topic?: string | null; facet?: FacetRef; signal?: Signal | null };

/** 最新一版面试笔记；没写过为 null。 */
export function notesOf(events: InterviewEvent[]): string | null {
  let latest: string | null = null;
  for (const item of events) if (item.type === "notes_written" && item.payload.content.trim()) latest = item.payload.content;
  return latest;
}

/** 事件 → 面试状态的输入（state.ts）。旧事件没有 action / signal：面试官那句按 kind 推（aside → clarify、closing → end、其余 probe；换材料由 topic 变化推）。 */
export function stateEventsOf(events: InterviewEvent[]): StateEvent[] {
  return events.flatMap((item): StateEvent[] => {
    if (item.type === "candidate_said") return [{ type: "candidate_said", seq: item.seq, signal: item.payload.signal ?? null, control: item.payload.control, content: item.payload.content }];
    if (item.type === "interviewer_said") {
      const action = item.payload.action ?? (item.payload.kind === "aside" ? "clarify" : item.payload.kind === "closing" ? "end" : "probe");
      return [{ type: "interviewer_said", seq: item.seq, action, materialId: item.payload.topic ?? null, facet: item.payload.facet ?? null }];
    }
    if (item.type === "notes_written") return [{ type: "notes_written", seq: item.seq, content: item.payload.content }];
    if (item.type === "ended") return [{ type: "ended", seq: item.seq }];
    return [];
  });
}

/** 逐字稿投影：双方说过的话，按 seq。 */
export function transcriptOf(events: InterviewEvent[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const item of events) {
    if (item.type === "candidate_said") lines.push({ seq: item.seq, role: "candidate", content: item.payload.content, kind: null, control: item.payload.control, at: item.at, signal: item.payload.signal ?? null });
    if (item.type === "interviewer_said") lines.push({ seq: item.seq, role: "interviewer", content: item.payload.content, kind: item.payload.kind, control: null, at: item.at, topic: item.payload.topic ?? null, facet: item.payload.facet ?? null });
  }
  return lines;
}

/** 结束事件；没有为 null（进行中，或旧数据）。 */
export function endedBy(events: InterviewEvent[]): EventPayload<"ended">["by"] | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const item = events[index];
    if (item.type === "ended") return item.payload.by;
  }
  return null;
}

import { z } from "zod";

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
/** 候选人短句里的求助 / 澄清；房间的提示、重复按钮也算。 */
const HELP_PATTERN = /(具体一点|具体点|什么意思|没听懂|没太懂|是什么|能再说|再说一遍|给个方向|提示|不太明白|哪个方向)/;
const HELP_MAX_CHARS = 40;

export function isHelpRequest(line: Pick<TranscriptLine, "role" | "content" | "control">): boolean {
  if (line.role !== "candidate") return false;
  if (line.control === "hint" || line.control === "repeat") return true;
  const text = line.content.trim();
  return text.length > 0 && text.length <= HELP_MAX_CHARS && HELP_PATTERN.test(text);
}

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
  }),
  /** 面试官说了一句；kind 是这句在流程里的角色（开场 / 提问 / 追问 / 答疑 / 收尾），旧系统的记账口径。 */
  interviewer_said: said.extend({ kind: z.string() }),
  /** 面试官的笔记（新系统：每回合整份重写）。 */
  notebook_written: z.object({ text: z.string() }),
  /** 面试官查了资料（技能包 / 简历段落）。 */
  tool_called: z.object({ name: z.string(), argument: z.string().nullable() }),
  /** 时钟估计：已用分钟与总时长。 */
  clock_tick: z.object({ usedMinutes: z.number().nonnegative(), totalMinutes: z.number().positive() }),
  /** 覆盖标注器给一次交换打的标签。 */
  label_added: z.object({ seq: z.number().int(), materialId: z.string().nullable(), competencyId: z.string().nullable(), act: z.string() }),
  /** 能力估计器更新。 */
  estimate_updated: z.object({ competencyId: z.string(), mean: z.number(), confidence: z.number(), samples: z.number().int() }),
  /** 评论员对面试官某一句（seq）的提醒：违反了哪条准则、下一句怎么改。 */
  critic_noted: z.object({ seq: z.number().int(), rule: z.string(), text: z.string() }),
  /** 在线评委给一段（按标注器的分段）打的分：考的哪项能力、答到阶梯第几层、分数与把握。 */
  segment_scored: z.object({ startSeq: z.number().int(), endSeq: z.number().int(), competencyId: z.string(), difficulty: z.number().int(), score: z.number(), confidence: z.number(), note: z.string() }),
  /** 模型没说出话，代码接了一句。 */
  fallback_used: z.object({ reason: z.string() }),
  /** 模型调用出错但回合继续（不可恢复的错误不落事件，回合本身失败）。 */
  model_error: z.object({ kind: z.string(), message: z.string() }),
  /** 面试结束：谁定的。 */
  ended: z.object({ by: z.enum(["interviewer", "candidate", "budget"]) }),
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

export type TranscriptLine = { seq: number; role: "interviewer" | "candidate"; content: string; kind: string | null; control: CandidateControl | null };

/** 逐字稿投影：双方说过的话，按 seq。 */
export function transcriptOf(events: InterviewEvent[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const item of events) {
    if (item.type === "candidate_said") lines.push({ seq: item.seq, role: "candidate", content: item.payload.content, kind: null, control: item.payload.control });
    if (item.type === "interviewer_said") lines.push({ seq: item.seq, role: "interviewer", content: item.payload.content, kind: item.payload.kind, control: null });
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

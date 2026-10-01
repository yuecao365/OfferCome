import { defineMessages, type Locale } from "@/lib/i18n/locale";
import type { InterviewArea } from "@/lib/mock-interviews/brief/brief";

import type { InterviewEvent } from "./events";
import { newlyNoted, nextStepOf } from "./notes";
import type { Action, Signal } from "./state";

/**
 * 面试官思路（给候选人看的 trace）：一场里面试官每一步的意图与它对你的判断，只留能帮你下次改进的部分。
 * 纯投影，不调模型：面试官每回合都重写一份笔记，"接下来"段是它这一步的打算，"已有结论 / 存疑"段新增的条目是它对你的判断。
 * 本地版从事件日志拼，体验版从消息拼（面试官消息带 notes），两端同一个函数。
 * 不放 token、耗时、兜底原因、系统提示词——那些在开发者记录页。
 */

/** 输入：一句话，本地版与体验版都能给出的字段。 */
export type TrailMessage = {
  turnIndex: number;
  role: "interviewer" | "candidate";
  kind: string;
  content: string;
  topic?: string | null;
  facet?: string | number | null;
  action?: Action | null;
  signal?: Signal | null;
  /** 面试官这回合写的笔记（整份）；没有就只列动作。 */
  notes?: string | null;
};

export type TrailNode = {
  turnIndex: number;
  /** 人话动作：继续追这一点 / 换个角度 / 问这段的第一个问题 / 换到另一段经历 / 把题说具体 / 收尾。 */
  move: string;
  /** 它这一步的打算（笔记"接下来"第一条）。 */
  why: string | null;
  /** 这回合新记下的结论与存疑（相对上一版笔记）。 */
  ledger: string | null;
  /** 候选人上一句是什么（人话），答了就 null。 */
  candidateNote: string | null;
  /** 点亮：这里被追到了 / 面试官记了存疑 / 你没答上。 */
  highlight: "pressed" | "doubt" | "stuck" | null;
  exchange: { candidate: string | null; interviewer: string };
};

export type TrailGroup = {
  areaId: string;
  name: string;
  kind: InterviewArea["kind"];
  /** 这段经历被追问了几句、几处存疑。 */
  probes: number;
  doubts: number;
  nodes: TrailNode[];
};

export type ReviewTrail = {
  groups: TrailGroup[];
  /** 收尾那句（有就显示一行）。 */
  closing: string | null;
  /** 面试官有没有写过笔记；旧场次没有，页面只列动作。 */
  hasReasons: boolean;
};

type Move = "opening" | "closing" | "clarify" | "switch" | "firstInArea" | "sameArea" | "sameFacet" | "newFacet";

/** 人话动作与候选人信号的标签（界面语言）。 */
const labels = defineMessages({
  "zh-CN": {
    moves: {
      opening: "开场",
      closing: "收尾",
      clarify: "把题说具体",
      switch: "换到另一段经历",
      firstInArea: "问这段的第一个问题",
      sameArea: "继续问这段",
      sameFacet: "继续追这一点",
      newFacet: "换个角度",
    } satisfies Record<Move, string>,
    signals: {
      thin: "你答得比较空",
      dont_know: "你说不会",
      help: "你要了提示",
      not_mine: "你说这块不是你做的",
      refuse: "你没有作答",
      wants_end: "你想结束",
    } as Partial<Record<Signal, string>>,
  },
  en: {
    moves: {
      opening: "Opening",
      closing: "Wrap-up",
      clarify: "Made the question concrete",
      switch: "Moved to another experience",
      firstInArea: "First question on this one",
      sameArea: "Kept on this experience",
      sameFacet: "Pressed on the same point",
      newFacet: "Tried another angle",
    },
    signals: {
      thin: "Your answer was thin",
      dont_know: "You said you didn't know",
      help: "You asked for a hint",
      not_mine: "You said this part wasn't yours",
      refuse: "You didn't answer",
      wants_end: "You wanted to end",
    },
  },
});

/** 笔记里这些字样表示面试官对你的回答记了存疑。 */
export const DOUBT_PATTERN = /(存疑|说不清|没说清|讲不清|没讲清|没给|未给|没有给|缺数字|没有数字|没量|含糊|对不上|不一致|答不上|说不上|模糊|回避|没答|未答|没回答|待核|待验|自相矛盾|只到名词|自认没|没做过)|\b(doubtful|unclear|vague|unverified|unsubstantiated|inconsistent|contradict\w*|evasive|hand-?wav\w*|no (?:numbers?|metrics?|baseline|data)|couldn'?t (?:explain|answer|say|back)|didn'?t (?:explain|answer|say|give)|not (?:backed|explained|answered)|doesn'?t add up)\b/i;

function moveOf(input: { action: Action | null | undefined; kind: string; opening: boolean; sameFacet: boolean; facet: string | number | null | undefined; firstInArea: boolean }): Move {
  if (input.opening) return "opening";
  if (input.kind === "closing" || input.action === "end") return "closing";
  if (input.kind === "aside" || input.action === "clarify") return "clarify";
  if (input.action === "switch") return "switch";
  if (input.firstInArea) return "firstInArea";
  if (input.facet === null || input.facet === undefined) return "sameArea";
  return input.sameFacet ? "sameFacet" : "newFacet";
}

export function moveLabel(input: Parameters<typeof moveOf>[0], locale: Locale = "zh-CN"): string {
  return labels[locale].moves[moveOf(input)];
}

/** 从消息拼思路。areas 给材料名与类型；没有 topic 的面试官发言（开场）不进任何组，收尾单独给一行。 */
export function reviewTrail(areas: Pick<InterviewArea, "id" | "name" | "kind">[], messages: TrailMessage[], locale: Locale = "zh-CN"): ReviewTrail {
  const t = labels[locale];
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const groups = new Map<string, TrailGroup>();
  let closing: string | null = null;
  let hasReasons = false;
  let pendingCandidate: TrailMessage | null = null;
  let previous: { topic: string | null; facet: string | number | null } = { topic: null, facet: null };
  let previousNotes: string | null = null;
  let opening = true;
  for (const message of messages) {
    if (message.role === "candidate") {
      pendingCandidate = message;
      continue;
    }
    const candidate = pendingCandidate;
    pendingCandidate = null;
    if (message.notes) hasReasons = true;
    const why = message.notes ? nextStepOf(previousNotes ?? message.notes) : null;
    const noted = message.notes ? newlyNoted(previousNotes, message.notes) : [];
    if (message.notes) previousNotes = message.notes;
    if (message.kind === "closing" || message.action === "end") {
      closing = message.content;
      continue;
    }
    if (opening) {
      opening = false;
      if (!message.topic) continue;
    }
    const topic: string | null = message.topic ?? previous.topic;
    if (!topic) continue;
    const area = areaById.get(topic);
    const group: TrailGroup = groups.get(topic) ?? { areaId: topic, name: area?.name ?? topic, kind: area?.kind ?? "quick", probes: 0, doubts: 0, nodes: [] };
    const firstInArea = group.nodes.length === 0;
    const sameFacet = previous.topic === topic && previous.facet !== null && previous.facet === (message.facet ?? null);
    const move = moveOf({ action: message.action, kind: message.kind, opening: false, sameFacet, facet: message.facet, firstInArea });
    const signal = candidate?.signal ?? message.signal ?? null;
    const candidateNote = candidate && signal && signal !== "answered" ? (t.signals[signal] ?? null) : null;
    const doubt = noted.some((item) => DOUBT_PATTERN.test(item));
    const stuck = signal === "dont_know" || signal === "not_mine" || signal === "thin";
    const highlight: TrailNode["highlight"] = stuck ? "stuck" : doubt ? "doubt" : sameFacet && move === "sameFacet" ? "pressed" : null;
    if (highlight === "pressed") group.probes += 1;
    if (doubt) group.doubts += 1;
    group.nodes.push({
      turnIndex: message.turnIndex,
      move: t.moves[move],
      why,
      ledger: noted.length > 0 ? noted.join("；") : null,
      candidateNote,
      highlight,
      exchange: { candidate: candidate && candidate.kind !== "control" ? candidate.content : null, interviewer: message.content },
    });
    groups.set(topic, group);
    previous = { topic, facet: message.facet ?? null };
  }
  return { groups: [...groups.values()], closing, hasReasons };
}

/** 本地版：事件日志 → 思路的输入。一个面试官发言算一回合，它后面紧跟的笔记归它。 */
export function trailMessagesOfEvents(events: InterviewEvent[]): TrailMessage[] {
  const out: TrailMessage[] = [];
  let turnIndex = 0;
  for (const item of events) {
    if (item.type === "candidate_said") {
      out.push({ turnIndex, role: "candidate", kind: item.payload.control ? "control" : "answer", content: item.payload.content, signal: item.payload.signal ?? null });
      continue;
    }
    if (item.type === "interviewer_said") {
      out.push({ turnIndex, role: "interviewer", kind: item.payload.kind, content: item.payload.content, topic: item.payload.topic ?? null, facet: item.payload.facet ?? null, action: item.payload.action ?? null, signal: item.payload.signal ?? null, notes: null });
      turnIndex += 1;
      continue;
    }
    if (item.type === "notes_written") {
      const last = out.at(-1);
      if (last && last.role === "interviewer") last.notes = item.payload.content;
    }
  }
  return out;
}

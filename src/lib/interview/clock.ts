import type { InterviewPace } from "@/lib/mock-interviews/brief/brief";

import type { TranscriptLine } from "./events";

/**
 * 时间盒：一场按分钟算，不按回合。
 * 文字版没有真实时间，按双方字数与每次交换的固定开销折算；语音版换成真实时间，接口不变。
 * 答疑、复述、提示自然只值几秒，不需要任何"不算回合"的规则。
 *
 * 档位按试用者的耐心定（2026-09-15）：快速 10 分钟约 5–6 个问答，标准 20 分钟约 10–12 个，深入 35 分钟约 18 个。
 */

export const DURATION_MINUTES: Record<InterviewPace, number> = { quick: 10, standard: 20, deep: 35 };

/**
 * 折算参数：候选人的回答按"说出来要多久"算——每分钟约 240 字，一条回答最多记 2.5 分钟（打字慢是用户自己的时间，
 * 不该吃掉面试的时间盒；2026-09-15 一位用户三条 600 字的回答就把 10 分钟的快速档用完了）；
 * 面试官读题 / 说话每分钟约 300 字；每次交换另加 20 秒读题与思考。
 */
export const CLOCK_RATES = { candidateCharsPerMinute: 240, maxAnswerMinutes: 2.5, interviewerCharsPerMinute: 300, exchangeOverheadMinutes: 1 / 3 } as const;
/** 语音版一次作答（从面试官说完到候选人的话落下）最多记这么多分钟：打开房间挂着、想很久都不该烧掉时间盒。 */
export const MAX_ANSWER_GAP_MINUTES = 4;
/** 每档至少问到的问答数（每次交换约 2 分钟）：时间到了但没问够就再问，硬顶仍在。快速 5、标准 10、深入 17。 */
export const MIN_EXCHANGE_MINUTES = 2;

/** 到这个比例提醒"还没问的场景题该进了"；到 WRAP_UP_RATIO 提醒收尾；到 1 由代码收尾。 */
export const LATE_RATIO = 0.75;
export const WRAP_UP_RATIO = 0.9;
/** 交换次数的硬顶：估计失真时也得结束——期望交换数（每次约 1.9 分钟）的 2 倍（爱求助的候选人交换多而短，1.5 倍会在 14 分钟切掉 20 分钟的场）。 */
export const HARD_CAP_FACTOR = 2;
const MINUTES_PER_EXCHANGE = 1.9;

export type ClockPhase = "open" | "late" | "wrap_up" | "over";

export type Clock = {
  usedMinutes: number;
  totalMinutes: number;
  /** 面试官说了几句（含开场与代码接的话——都是候选人听到的）。 */
  exchanges: number;
  phase: ClockPhase;
};

export function hardCap(totalMinutes: number): number {
  return Math.ceil((totalMinutes / MINUTES_PER_EXCHANGE) * HARD_CAP_FACTOR);
}

export function minExchanges(totalMinutes: number): number {
  return Math.floor(totalMinutes / MIN_EXCHANGE_MINUTES);
}

function clockOf(minutes: number, exchanges: number, totalMinutes: number): Clock {
  const usedMinutes = Math.round(minutes * 10) / 10;
  const ratio = usedMinutes / totalMinutes;
  const timeUp = ratio >= 1 && exchanges >= minExchanges(totalMinutes);
  const phase: ClockPhase = timeUp || exchanges >= hardCap(totalMinutes) ? "over" : ratio >= WRAP_UP_RATIO ? "wrap_up" : ratio >= LATE_RATIO ? "late" : "open";
  return { usedMinutes, totalMinutes, exchanges, phase };
}

const countExchanges = (transcript: Pick<TranscriptLine, "role">[]) => transcript.filter((line) => line.role === "interviewer").length;

/** 文字版：按双方字数与每次交换的固定开销折算。 */
export function estimateClock(transcript: Pick<TranscriptLine, "role" | "content">[], totalMinutes: number): Clock {
  let minutes = 0;
  for (const line of transcript) {
    const chars = line.content.replace(/\s+/g, "").length;
    if (line.role === "candidate") minutes += Math.min(CLOCK_RATES.maxAnswerMinutes, chars / CLOCK_RATES.candidateCharsPerMinute);
    else minutes += chars / CLOCK_RATES.interviewerCharsPerMinute + CLOCK_RATES.exchangeOverheadMinutes;
  }
  return clockOf(minutes, countExchanges(transcript), totalMinutes);
}

/**
 * 语音版：真实作答时间——每条回答记"面试官说完 → 候选人的话落下"这一段（最多 4 分钟），再加每次交换的固定开销；
 * 还没答的那段不计（打开房间挂着不烧时间）。阶段与硬顶同文字版。没有时刻的句子按开销算。
 */
export function realTimeClock(transcript: Pick<TranscriptLine, "role" | "at">[], totalMinutes: number): Clock {
  let minutes = 0;
  let askedAt: Date | undefined;
  for (const line of transcript) {
    if (line.role === "interviewer") {
      minutes += CLOCK_RATES.exchangeOverheadMinutes;
      askedAt = line.at;
      continue;
    }
    if (askedAt && line.at) minutes += Math.min(MAX_ANSWER_GAP_MINUTES, Math.max(0, (line.at.getTime() - askedAt.getTime()) / 60_000));
    askedAt = undefined;
  }
  return clockOf(minutes, countExchanges(transcript), totalMinutes);
}

export function minutesLeft(clock: Clock): number {
  return Math.max(0, Math.round((clock.totalMinutes - clock.usedMinutes) * 10) / 10);
}

/** 给面试官看的一行（阶段提醒在覆盖账那里，这里只报时间）。 */
export function renderClock(clock: Clock): string {
  const base = `时间：已用约 ${clock.usedMinutes} 分钟，共 ${clock.totalMinutes} 分钟，还剩约 ${minutesLeft(clock)} 分钟。`;
  if (clock.phase === "over") return `${base}时间到了：这句只告别，不再提问。`;
  if (clock.phase === "wrap_up") return `${base}快到时间了：该收的收，最多再问一两句就告别。`;
  return base;
}

import type { InterviewPace } from "@/lib/mock-interviews/brief/brief";

import type { TranscriptLine } from "./events";

/**
 * 时间盒（interview-system-design.md §6.2 之外的 "时钟"）：一场按分钟算，不按回合。
 * 文字版没有真实时间，按双方字数与每次交换的固定开销折算；语音版换成真实时间，接口不变。
 * 答疑、复述、提示自然只值几秒，不需要任何"不算回合"的规则。
 */

export const DURATION_MINUTES: Record<InterviewPace, number> = { quick: 20, standard: 35, deep: 50 };

/** 折算参数：候选人边想边写（文字版）每分钟约 120 字；面试官读题 / 说话每分钟约 300 字；每次交换另加 20 秒读题与思考。 */
export const CLOCK_RATES = { candidateCharsPerMinute: 120, interviewerCharsPerMinute: 300, exchangeOverheadMinutes: 1 / 3 } as const;

/** 到这个比例提醒收尾；到 1 由代码收尾。 */
export const WRAP_UP_RATIO = 0.9;
/** 交换次数的硬顶：估计失真时也得结束——期望交换数（每次约 1.5 分钟）的 1.5 倍。 */
export const HARD_CAP_FACTOR = 1.5;
const MINUTES_PER_EXCHANGE = 1.5;

export type Clock = {
  usedMinutes: number;
  totalMinutes: number;
  /** 面试官说了几句（含开场，不含代码接的话也算——都是候选人听到的）。 */
  exchanges: number;
  phase: "open" | "wrap_up" | "over";
};

export function hardCap(totalMinutes: number): number {
  return Math.ceil((totalMinutes / MINUTES_PER_EXCHANGE) * HARD_CAP_FACTOR);
}

export function estimateClock(transcript: Pick<TranscriptLine, "role" | "content">[], totalMinutes: number): Clock {
  let minutes = 0;
  let exchanges = 0;
  for (const line of transcript) {
    const chars = line.content.replace(/\s+/g, "").length;
    if (line.role === "candidate") minutes += chars / CLOCK_RATES.candidateCharsPerMinute;
    else {
      minutes += chars / CLOCK_RATES.interviewerCharsPerMinute + CLOCK_RATES.exchangeOverheadMinutes;
      exchanges += 1;
    }
  }
  const usedMinutes = Math.round(minutes * 10) / 10;
  const ratio = usedMinutes / totalMinutes;
  const phase: Clock["phase"] = ratio >= 1 || exchanges >= hardCap(totalMinutes) ? "over" : ratio >= WRAP_UP_RATIO ? "wrap_up" : "open";
  return { usedMinutes, totalMinutes, exchanges, phase };
}

/** 给面试官看的一行。 */
export function renderClock(clock: Clock): string {
  const left = Math.max(0, Math.round((clock.totalMinutes - clock.usedMinutes) * 10) / 10);
  const base = `时间：已用约 ${clock.usedMinutes} 分钟，共 ${clock.totalMinutes} 分钟，还剩约 ${left} 分钟。`;
  if (clock.phase === "over") return `${base}时间到了：这句只告别，不再提问。`;
  if (clock.phase === "wrap_up") return `${base}快到时间了：该收的收，最多再问一两句就告别。`;
  return base;
}

import { formatTimeOfDay } from "@/lib/format/date";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * 面试日程用的口语化时间：临近时给到具体时刻，较远时只说还有几天。
 * 服务端渲染，不做实时倒计时。
 */
export function describeInterviewTime(
  interviewedAt: Date,
  now: Date = new Date(),
): string {
  const diff = interviewedAt.getTime() - now.getTime();

  if (diff <= 0) {
    const elapsed = -diff;
    if (elapsed < HOUR_MS) return "刚刚结束";
    if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} 小时前`;
    return `${Math.floor(elapsed / DAY_MS)} 天前`;
  }

  if (diff < HOUR_MS) {
    return `${Math.max(1, Math.round(diff / MINUTE_MS))} 分钟后`;
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const daysAhead = Math.floor(
    (interviewedAt.getTime() - startOfToday.getTime()) / DAY_MS,
  );

  if (daysAhead === 0) return `今天 ${formatTimeOfDay(interviewedAt)}`;
  if (daysAhead === 1) return `明天 ${formatTimeOfDay(interviewedAt)}`;
  if (daysAhead === 2) return `后天 ${formatTimeOfDay(interviewedAt)}`;
  return `${daysAhead} 天后`;
}

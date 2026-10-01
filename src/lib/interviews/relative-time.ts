import { formatTimeOfDay } from "@/lib/format/date";
import type { Locale } from "@/lib/i18n/locale";

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
  locale: Locale = "zh-CN",
): string {
  const en = locale === "en";
  const time = () => formatTimeOfDay(interviewedAt, "", locale);
  const diff = interviewedAt.getTime() - now.getTime();

  if (diff <= 0) {
    const elapsed = -diff;
    if (elapsed < HOUR_MS) return en ? "Just ended" : "刚刚结束";
    if (elapsed < DAY_MS) return en ? `${Math.floor(elapsed / HOUR_MS)} h ago` : `${Math.floor(elapsed / HOUR_MS)} 小时前`;
    return en ? `${Math.floor(elapsed / DAY_MS)} d ago` : `${Math.floor(elapsed / DAY_MS)} 天前`;
  }

  if (diff < HOUR_MS) {
    const minutes = Math.max(1, Math.round(diff / MINUTE_MS));
    return en ? `in ${minutes} min` : `${minutes} 分钟后`;
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const daysAhead = Math.floor(
    (interviewedAt.getTime() - startOfToday.getTime()) / DAY_MS,
  );

  if (daysAhead === 0) return en ? `Today ${time()}` : `今天 ${time()}`;
  if (daysAhead === 1) return en ? `Tomorrow ${time()}` : `明天 ${time()}`;
  if (daysAhead === 2) return en ? `In 2 days, ${time()}` : `后天 ${time()}`;
  return en ? `in ${daysAhead} days` : `${daysAhead} 天后`;
}

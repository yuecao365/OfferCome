/**
 * 全站日期显示的唯一出口。此前 10 个文件各写一份 Intl.DateTimeFormat，
 * 看着一样其实有 4 种格式和 3 种空值文案，改一处必漏几处。
 *
 * 空值文案是调用方的语义（"尚未同步" / "未设置" / "已是最新"），
 * 所以做成参数而不是写死。语言是最后一个可选参数，界面按当前 locale 传。
 */

import type { Locale } from "@/lib/i18n/locale";

type DateInput = Date | string | number | null | undefined;

const DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };
const DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};
const SHORT_DATE_TIME: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const LONG_DATE_TIME: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};
const TIME_OF_DAY: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

// Intl.DateTimeFormat 实例不可变且构造开销不小，按选项缓存复用。
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(options: Intl.DateTimeFormatOptions, locale: Locale): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  const cached = formatters.get(key);
  if (cached) return cached;

  const created = new Intl.DateTimeFormat(locale, options);
  formatters.set(key, created);
  return created;
}

function format(
  value: DateInput,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
  locale: Locale,
): string {
  if (value === null || value === undefined) return fallback;

  const date = value instanceof Date ? value : new Date(value);
  // 无效日期原本会让 Intl 抛 RangeError 把整页打挂，这里一并降级为空值文案。
  if (Number.isNaN(date.getTime())) return fallback;

  return formatterFor(options, locale).format(date);
}

/** 2026年8月26日 */
export function formatDate(value: DateInput, fallback = "", locale: Locale = "zh-CN"): string {
  return format(value, DATE, fallback, locale);
}

/** 2026年8月26日 14:30 */
export function formatDateTime(value: DateInput, fallback = "", locale: Locale = "zh-CN"): string {
  return format(value, DATE_TIME, fallback, locale);
}

/** 8月26日 14:30 —— 列表里空间紧张时用 */
export function formatShortDateTime(value: DateInput, fallback = "", locale: Locale = "zh-CN"): string {
  return format(value, SHORT_DATE_TIME, fallback, locale);
}

/** 八月26日 14:30 —— 固定 24 小时制 */
export function formatLongDateTime(value: DateInput, fallback = "", locale: Locale = "zh-CN"): string {
  return format(value, LONG_DATE_TIME, fallback, locale);
}

/** 14:30 */
export function formatTimeOfDay(value: DateInput, fallback = "", locale: Locale = "zh-CN"): string {
  return format(value, TIME_OF_DAY, fallback, locale);
}

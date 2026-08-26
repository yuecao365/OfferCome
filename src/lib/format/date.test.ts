import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDate,
  formatDateTime,
  formatLongDateTime,
  formatShortDateTime,
  formatTimeOfDay,
} from "./date";

const SAMPLE = new Date("2026-08-26T14:30:00");

/**
 * 这些选项是从被替换掉的 10 处内联实现里逐字抄来的，故意不从 date.ts 导入——
 * 独立声明才能真正验证"新模块和旧代码格式完全一致"。
 */
function legacy(options: Intl.DateTimeFormatOptions, date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

test("keeps the medium date format used by the interviews and resumes lists", () => {
  assert.equal(formatDate(SAMPLE), legacy({ dateStyle: "medium" }, SAMPLE));
});

test("keeps the medium date plus short time format used by the dashboard and detail views", () => {
  assert.equal(
    formatDateTime(SAMPLE),
    legacy({ dateStyle: "medium", timeStyle: "short" }, SAMPLE),
  );
});

test("keeps the compact month-day format used by the application and interview tables", () => {
  assert.equal(
    formatShortDateTime(SAMPLE),
    legacy(
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
      SAMPLE,
    ),
  );
});

test("keeps the 24-hour long format used by the capability profile header", () => {
  assert.equal(
    formatLongDateTime(SAMPLE),
    legacy(
      {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
      SAMPLE,
    ),
  );
});

test("keeps the time-only format used by relative interview times", () => {
  assert.equal(
    formatTimeOfDay(SAMPLE),
    legacy({ hour: "2-digit", minute: "2-digit" }, SAMPLE),
  );
});

test("returns the caller's own wording for missing dates", () => {
  assert.equal(formatDateTime(null, "尚未同步"), "尚未同步");
  assert.equal(formatShortDateTime(null, "未设置"), "未设置");
  assert.equal(formatLongDateTime(null, "已是最新"), "已是最新");
  assert.equal(formatDate(undefined, "未设置"), "未设置");
  assert.equal(formatDate(null), "");
});

test("accepts both Date objects and the ISO strings stored on client props", () => {
  assert.equal(
    formatLongDateTime(SAMPLE.toISOString()),
    formatLongDateTime(new Date(SAMPLE.toISOString())),
  );
});

test("degrades unparsable values to the fallback instead of throwing", () => {
  assert.equal(formatDate("not a date", "未设置"), "未设置");
  assert.equal(formatDateTime(Number.NaN, "未设置"), "未设置");
});

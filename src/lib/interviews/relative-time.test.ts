import assert from "node:assert/strict";
import test from "node:test";

import { describeInterviewTime } from "./relative-time";

// 函数按本地时间判断"今天/明天"，测试锚点也用本地时间构造，避免时区影响。
const now = new Date(2026, 7, 16, 12, 0, 0);

function offsetFromNow(milliseconds: number): Date {
  return new Date(now.getTime() + milliseconds);
}

test("describeInterviewTime 对临近的面试给出具体时刻", () => {
  assert.equal(describeInterviewTime(offsetFromNow(30 * 60_000), now), "30 分钟后");
  assert.match(
    describeInterviewTime(new Date(2026, 7, 16, 20, 0, 0), now),
    /^今天 /,
  );
  assert.match(
    describeInterviewTime(new Date(2026, 7, 17, 9, 0, 0), now),
    /^明天 /,
  );
  assert.match(
    describeInterviewTime(new Date(2026, 7, 18, 9, 0, 0), now),
    /^后天 /,
  );
});

test("describeInterviewTime 对较远的面试只说天数", () => {
  assert.equal(
    describeInterviewTime(new Date(2026, 7, 21, 9, 0, 0), now),
    "5 天后",
  );
});

test("describeInterviewTime 对已过去的面试给出流逝时间", () => {
  assert.equal(describeInterviewTime(offsetFromNow(-30 * 60_000), now), "刚刚结束");
  assert.equal(describeInterviewTime(offsetFromNow(-6 * 3_600_000), now), "6 小时前");
  assert.equal(
    describeInterviewTime(offsetFromNow(-2 * 86_400_000), now),
    "2 天前",
  );
});

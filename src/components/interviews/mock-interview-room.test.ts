import assert from "node:assert/strict";
import test from "node:test";

import { questionProgressState } from "./mock-interview-room";

/**
 * 进度格的颜色只表示作答状态；"是不是追问"由形状单独表达。
 * 这条测试锁住两者正交——已回答的追问曾被画成普通的已答题。
 */

test("按下标推导作答状态", () => {
  const answered = { skipped: false };
  assert.equal(questionProgressState(answered, 0, 2), "answered");
  assert.equal(questionProgressState(answered, 2, 2), "current");
  assert.equal(questionProgressState(answered, 3, 2), "pending");
  assert.equal(questionProgressState({ skipped: true }, 0, 2), "skipped");
});

test("状态与是否追问无关", () => {
  // 追问只是题目属性，不参与状态推导：同样的下标必须得到同样的状态。
  const followUp = { skipped: false, isFollowUp: true };
  const main = { skipped: false, isFollowUp: false };
  for (const index of [0, 1, 2, 3]) {
    assert.equal(
      questionProgressState(followUp, index, 2),
      questionProgressState(main, index, 2),
    );
  }
});

test("当前题即使已跳过标记也按当前显示", () => {
  assert.equal(questionProgressState({ skipped: true }, 1, 1), "current");
});

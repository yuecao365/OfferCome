import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { initialNotes, newlyNoted, nextStepOf, NOTES_MAX_CHARS, notesVerdict, pendingCount } from "./notes";

/** 面试笔记（agent-freedom-plan §2.8）：开场预填、格式门、从"待验证"数条目、报告页用的差分。 */

const brief = testBrief({ hypotheses: [{ id: "h1", source: "resume", text: "简历称重试 3 次", evidence: "重试 3 次", projectId: "proj-1" }, { id: "h2", source: "resume", text: "prompt 降 50%", evidence: "50%", projectId: null }] });
const ids = ["h1", "h2"];
const notes = (pending: string[], concluded: string[], next = "- 追退避") => `## 待验证\n${pending.join("\n") || "（无）"}\n## 已有结论\n${concluded.join("\n") || "（还没有）"}\n## 存疑\n（无）\n## 接下来\n${next}`;

test("开场预填：待验证列出备课假设并带编号与项目名，接下来指向第一份主线材料", () => {
  const first = initialNotes(brief);
  assert.match(first, /## 待验证\n- \[h1\] 简历称重试 3 次（[^）]*）\n- \[h2\] prompt 降 50%/);
  assert.match(first, /## 接下来\n- 先聊主线材料 p1-overview/);
  assert.equal(pendingCount(first), 2);
  assert.equal(notesVerdict(first, ids), null, "预填的笔记自己过门");
});

test("格式门：缺段落、编号丢了、编号两段都留、超长各退回一次原因；正常的放行", () => {
  assert.match(notesVerdict("## 待验证\n- [h1] x\n## 接下来\n- 继续", ids) ?? "", /缺少段落：## 已有结论、## 存疑/);
  assert.match(notesVerdict(notes(["- [h1] x"], ["- 成立：y"]), ids) ?? "", /\[h2\] 不见了/);
  assert.match(notesVerdict(notes(["- [h1] x", "- [h2] y"], ["- [h2] 给不出"]), ids) ?? "", /\[h2\] 同时在/);
  assert.match(notesVerdict(notes(["- [h1] x"], ["- [h2] 给不出"], `- ${"长".repeat(NOTES_MAX_CHARS)}`), ids) ?? "", /超过/);
  assert.equal(notesVerdict(notes(["- [h1] x"], ["- [h2] 给不出"]), ids), null);
  assert.equal(pendingCount(notes(["- [h1] x"], ["- [h2] 给不出"])), 1);
});

test("报告页用的差分：理由取「接下来」第一条，新记下的结论与存疑相对上一版算", () => {
  const before = notes(["- [h1] x", "- [h2] y"], []);
  const after = notes(["- [h2] y"], ["- [h1] 被推翻：没有退避"], "- 切 q1");
  assert.equal(nextStepOf(before), "追退避");
  assert.deepEqual(newlyNoted(before, after), ["[h1] 被推翻：没有退避"]);
  assert.deepEqual(newlyNoted(after, after), []);
});

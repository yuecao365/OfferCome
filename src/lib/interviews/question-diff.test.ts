import assert from "node:assert/strict";
import test from "node:test";

import { diffInterviewQuestions } from "./question-diff";
import type { InterviewQuestionInput } from "./types";

function question(
  overrides: Partial<InterviewQuestionInput> = {},
): InterviewQuestionInput {
  return {
    question: "请介绍项目",
    answer: "项目回答",
    category: "resume_project",
    resumeProjectId: "project-1",
    sortOrder: 0,
    ...overrides,
  };
}

test("diffInterviewQuestions preserves retained ids and separates creates and deletes", () => {
  const result = diffInterviewQuestions(
    [{ id: "q-1" }, { id: "q-2" }],
    [
      question({ id: "q-1", answer: "更新后的回答" }),
      question({ question: "新增问题", sortOrder: 1 }),
    ],
  );

  assert.deepEqual(result.toUpdate, [
    question({ id: "q-1", answer: "更新后的回答" }),
  ]);
  assert.deepEqual(result.toCreate, [
    question({ question: "新增问题", sortOrder: 1 }),
  ]);
  assert.deepEqual(result.toDeleteIds, ["q-2"]);
});

test("diffInterviewQuestions rejects an id from another interview", () => {
  assert.throws(
    () => diffInterviewQuestions([{ id: "q-1" }], [question({ id: "q-2" })]),
    /不属于当前面试/,
  );
});

test("diffInterviewQuestions rejects duplicate retained ids", () => {
  assert.throws(
    () =>
      diffInterviewQuestions(
        [{ id: "q-1" }],
        [question({ id: "q-1" }), question({ id: "q-1", sortOrder: 1 })],
      ),
    /不能在面试中重复出现/,
  );
});

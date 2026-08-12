import assert from "node:assert/strict";
import test from "node:test";

import {
  groupQuestionReviewItems,
  paginateQuestionReviewItems,
  parseInterviewReviewFilters,
  type QuestionReviewItem,
} from "./review";

function reviewRow(input: {
  id: string;
  question: string;
  category?: string;
  resumeProjectId?: string | null;
  date: string;
}) {
  return {
    id: input.id,
    question: input.question,
    answer: `${input.id} answer`,
    category: input.category ?? "general",
    resumeProjectId: input.resumeProjectId ?? null,
    sortOrder: 0,
    createdAt: new Date(input.date),
    updatedAt: new Date(input.date),
    interview: {
      id: `interview-${input.id}`,
      companyName: "示例公司",
      jobTitle: "工程师",
      interviewedAt: new Date(input.date),
      scheduledAt: null,
      round: "first_interview",
    },
  };
}

test("groups repeated questions with answers newest first", () => {
  const rows = [
    {
      id: "q-old",
      question: "What does React key do?",
      answer: "old answer",
      category: "technical",
      resumeProjectId: null,
      sortOrder: 0,
      createdAt: new Date("2026-07-01T10:00:00Z"),
      updatedAt: new Date("2026-07-01T10:00:00Z"),
      interview: {
        id: "i-old",
        companyName: "A Company",
        jobTitle: "Frontend",
        interviewedAt: new Date("2026-07-01T10:00:00Z"),
        scheduledAt: null,
        round: "first_interview",
      },
    },
    {
      id: "q-new",
      question: " What does React key do? ",
      answer: "new answer",
      category: "technical",
      resumeProjectId: null,
      sortOrder: 0,
      createdAt: new Date("2026-07-05T10:00:00Z"),
      updatedAt: new Date("2026-07-05T10:00:00Z"),
      interview: {
        id: "i-new",
        companyName: "B Company",
        jobTitle: "Frontend Engineer",
        interviewedAt: new Date("2026-07-05T10:00:00Z"),
        scheduledAt: null,
        round: "second_interview",
      },
    },
  ];

  const grouped = groupQuestionReviewItems(rows);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].question, "What does React key do?");
  assert.equal(grouped[0].askedCount, 2);
  assert.equal(grouped[0].answers[0].answer, "new answer");
  assert.equal(grouped[0].answers[1].answer, "old answer");
});

test("merges similarly worded questions and keeps the newest wording", () => {
  const grouped = groupQuestionReviewItems([
    reviewRow({ id: "old", question: "请介绍一下你的项目经验和主要职责", date: "2026-07-01T00:00:00Z" }),
    reviewRow({ id: "new", question: "请介绍一下你的项目经历和主要职责", date: "2026-07-02T00:00:00Z" }),
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].question, "请介绍一下你的项目经历和主要职责");
  assert.equal(grouped[0].askedCount, 2);
  assert.deepEqual(grouped[0].answers.map((item) => item.id), ["new", "old"]);
});

test("does not merge similar questions across categories", () => {
  const grouped = groupQuestionReviewItems([
    reviewRow({ id: "general", question: "请介绍一下你的项目经验和主要职责", category: "general", date: "2026-07-01T00:00:00Z" }),
    reviewRow({ id: "technical", question: "请介绍一下你的项目经历和主要职责", category: "technical", date: "2026-07-02T00:00:00Z" }),
  ]);
  assert.equal(grouped.length, 2);
});

test("does not merge low-similarity questions in the same bucket", () => {
  const grouped = groupQuestionReviewItems([
    reviewRow({ id: "intro", question: "请介绍一下你的项目经验和主要职责", date: "2026-07-01T00:00:00Z" }),
    reviewRow({ id: "debug", question: "如何定位线上内存泄漏问题", date: "2026-07-02T00:00:00Z" }),
  ]);
  assert.equal(grouped.length, 2);
});

test("parses review filters from query params", () => {
  assert.deepEqual(parseInterviewReviewFilters({}), {
    section: "overview",
    projectId: null,
    category: null,
    page: 1,
  });

  assert.deepEqual(
    parseInterviewReviewFilters({ projectId: "project-1", page: "2" }),
    {
      section: "projects",
      projectId: "project-1",
      category: null,
      page: 2,
    },
  );

  assert.deepEqual(
    parseInterviewReviewFilters({ category: "technical", page: "-1" }),
    {
      section: "question_bank",
      projectId: null,
      category: "technical",
      page: 1,
    },
  );
});

test("paginates grouped review questions", () => {
  const items: QuestionReviewItem[] = Array.from({ length: 17 }, (_, index) => ({
    question: `question-${index + 1}`,
    category: "general",
    resumeProjectId: null,
    askedCount: 1,
    lastAskedAt: null,
    answers: [],
  }));

  const page = paginateQuestionReviewItems(items, 2, 8);

  assert.equal(page.total, 17);
  assert.equal(page.page, 2);
  assert.equal(page.totalPages, 3);
  assert.deepEqual(
    page.items.map((item) => item.question),
    [
      "question-9",
      "question-10",
      "question-11",
      "question-12",
      "question-13",
      "question-14",
      "question-15",
      "question-16",
    ],
  );
});

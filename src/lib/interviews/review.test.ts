import assert from "node:assert/strict";
import test from "node:test";

import {
  groupQuestionReviewItems,
  paginateQuestionReviewItems,
  parseInterviewReviewFilters,
  type QuestionReviewItem,
} from "./review";

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

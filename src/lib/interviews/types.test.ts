import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRealInterviewStatus,
  normalizeQuestionCategory,
  parseInterviewFilters,
  parseInterviewFormData,
  statusLabel,
} from "./types";

test("derives real interview status from the interview time", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");

  assert.equal(
    deriveRealInterviewStatus(new Date("2026-08-18T15:00:00.000Z"), now),
    "scheduled",
  );
  assert.equal(
    deriveRealInterviewStatus(new Date("2026-08-14T15:00:00.000Z"), now),
    "completed",
  );
  // 正好到点视为已开始，避免边界上停在待面试。
  assert.equal(deriveRealInterviewStatus(now, now), "completed");
});

test("parses interview form data with ordered question answers", () => {
  const formData = new FormData();
  formData.set("companyName", " Example Co ");
  formData.set("jobTitle", " Frontend Engineer ");
  formData.set("scheduledAt", "2026-07-08T10:30");
  formData.set("round", "first_interview");
  formData.set("note", " Bring portfolio ");
  formData.set(
    "questionsJson",
    JSON.stringify([
      {
        question: " 介绍一个项目 ",
        answer: " 讲 Career Agent ",
        category: "resume_project",
        resumeProjectId: "project-1",
      },
      { question: "   ", answer: "skip me" },
      { question: "React Server Components?", answer: "", category: "technical" },
    ]),
  );

  const parsed = parseInterviewFormData(formData);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.companyName, "Example Co");
  assert.equal(parsed.value.jobTitle, "Frontend Engineer");
  assert.equal("status" in parsed.value, false);
  assert.equal(parsed.value.questions.length, 2);
  assert.deepEqual(
    parsed.value.questions.map((question) => question.sortOrder),
    [0, 1],
  );
  assert.deepEqual(
    parsed.value.questions.map((question) => question.category),
    ["resume_project", "technical"],
  );
  assert.equal(parsed.value.questions[0].resumeProjectId, "project-1");
});

test("rejects interview form data without required fields", () => {
  const formData = new FormData();
  formData.set("companyName", "");
  formData.set("jobTitle", "");
  formData.set("scheduledAt", "");
  formData.set("questionsJson", "[]");

  const parsed = parseInterviewFormData(formData);

  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /公司名称/);
});

test("labels interview statuses", () => {
  assert.equal(statusLabel("in_progress"), "进行中");
  assert.equal(statusLabel("completed"), "已完成");
});

test("normalizes unknown question categories to general", () => {
  assert.equal(normalizeQuestionCategory("resume_project"), "resume_project");
  assert.equal(normalizeQuestionCategory("technical"), "technical");
  assert.equal(normalizeQuestionCategory("unknown"), "general");
  assert.equal(normalizeQuestionCategory(null), "general");
});

test("parses interview history filters from URL query values", () => {
  const filters = parseInterviewFilters({
    q: "  react ",
    status: "completed",
    round: "first_interview",
    category: "technical",
    sort: "oldest",
  });

  assert.deepEqual(filters, {
    q: "react",
    status: "completed",
    round: "first_interview",
    category: "technical",
    sort: "oldest",
    page: 1,
  });
});

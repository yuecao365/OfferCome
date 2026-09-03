import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewFilters, InterviewFormValue } from "@/lib/interviews/types";

import { createEmptyWorkspace, type TrialWorkspace } from "./workspace";
import {
  addCompletedMockInterview,
  applicationStageCounts,
  deleteInterview,
  interviewStats,
  interviewWorkspaceOverview,
  queryInterviews,
  upcomingInterviews,
  upsertInterview,
} from "./workspace-interviews";

/** 体验版面试层的纯操作测试——口径必须与本地版查询一致。 */

const baseFilters: InterviewFilters = {
  q: "",
  kind: "all",
  status: "all",
  round: "all",
  category: "all",
  sort: "newest",
  page: 1,
};

function formValue(overrides: Partial<InterviewFormValue> = {}): InterviewFormValue {
  return {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    interviewedAt: new Date("2026-08-01T14:00:00"),
    round: "first_interview",
    note: "",
    questions: [
      {
        question: "介绍一下你自己",
        answer: "……",
        category: "general",
        resumeProjectId: null,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

function seeded(): TrialWorkspace {
  let workspace = createEmptyWorkspace();
  workspace = upsertInterview(workspace, formValue());
  workspace = upsertInterview(
    workspace,
    formValue({
      companyName: "青竹信息",
      jobTitle: "Go 开发",
      round: "second_interview",
      interviewedAt: new Date("2026-08-10T10:00:00"),
      questions: [
        {
          question: "讲讲缓存一致性",
          answer: "……",
          category: "technical",
          resumeProjectId: null,
          sortOrder: 0,
        },
      ],
    }),
  );
  return workspace;
}

test("upsertInterview 按面试时间推导状态", () => {
  const workspace = upsertInterview(
    createEmptyWorkspace(),
    formValue({ interviewedAt: new Date(Date.now() + 24 * 60 * 60 * 1_000) }),
  );
  assert.equal(workspace.interviews[0].status, "scheduled");

  const past = upsertInterview(createEmptyWorkspace(), formValue());
  assert.equal(past.interviews[0].status, "completed");
});

test("upsertInterview 以 id 更新时保留 kind/评分", () => {
  let workspace = addCompletedMockInterview(createEmptyWorkspace(), {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    questions: [
      { question: "Q", answer: "A", category: "technical", score: 80, feedback: "好" },
    ],
    totalScore: 80,
    report: { totalScore: 80, summary: "总结", strengths: [], improvements: [], actionPlan: [] },
  });
  const id = workspace.interviews[0].id;
  workspace = upsertInterview(workspace, formValue(), id);
  assert.equal(workspace.interviews.length, 1);
  assert.equal(workspace.interviews[0].kind, "mock");
  assert.equal(workspace.interviews[0].totalScore, 80);
});

test("deleteInterview 删除指定记录", () => {
  const workspace = seeded();
  const id = workspace.interviews[0].id;
  const next = deleteInterview(workspace, id);
  assert.equal(next.interviews.length, 1);
  assert.ok(next.interviews.every((item) => item.id !== id));
});

test("queryInterviews 支持关键词、轮次与问题类型筛选", () => {
  const workspace = seeded();

  const byQuery = queryInterviews(workspace, { ...baseFilters, q: "青竹" });
  assert.equal(byQuery.total, 1);
  assert.equal(byQuery.interviews[0].companyName, "青竹信息");

  const byQuestion = queryInterviews(workspace, { ...baseFilters, q: "缓存" });
  assert.equal(byQuestion.total, 1);

  const byRound = queryInterviews(workspace, { ...baseFilters, round: "first_interview" });
  assert.equal(byRound.total, 1);
  assert.equal(byRound.interviews[0].companyName, "云帆科技");

  const byCategory = queryInterviews(workspace, { ...baseFilters, category: "technical" });
  assert.equal(byCategory.total, 1);

  const oldest = queryInterviews(workspace, { ...baseFilters, sort: "oldest" });
  assert.equal(oldest.interviews[0].companyName, "云帆科技");
});

test("模拟面试记录以自身 id 充当会话 id", () => {
  const workspace = addCompletedMockInterview(createEmptyWorkspace(), {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    questions: [
      { question: "Q", answer: null, category: "general", score: null, feedback: null },
    ],
    totalScore: 72,
    report: { totalScore: 80, summary: "总结", strengths: [], improvements: [], actionPlan: [] },
  });
  const item = queryInterviews(workspace, baseFilters).interviews[0];
  assert.equal(item.kind, "mock");
  assert.equal(item.mockSessionId, item.id);
});

test("interviewStats 只统计真实面试", () => {
  let workspace = seeded();
  workspace = addCompletedMockInterview(workspace, {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    questions: [],
    totalScore: 90,
    report: { totalScore: 80, summary: "总结", strengths: [], improvements: [], actionPlan: [] },
  });
  const stats = interviewStats(workspace);
  assert.equal(stats.total, 2);
});

test("interviewWorkspaceOverview 汇总模拟均分与轮次分布", () => {
  let workspace = seeded();
  workspace = addCompletedMockInterview(workspace, {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    questions: [],
    totalScore: 81,
    report: { totalScore: 80, summary: "总结", strengths: [], improvements: [], actionPlan: [] },
  });
  const overview = interviewWorkspaceOverview(workspace);
  assert.equal(overview.completedMockCount, 1);
  assert.equal(overview.averageMockScore, 81);
  assert.equal(overview.realInterviewCounts.total, 2);
  assert.equal(overview.realInterviewRoundCounts.firstInterview, 1);
  assert.equal(overview.realInterviewRoundCounts.secondInterview, 1);
  assert.equal(overview.recent.length, 3);
});

test("upcomingInterviews 区分未来面试与待补录", () => {
  const now = new Date("2026-08-31T12:00:00");
  let workspace = createEmptyWorkspace();
  workspace = upsertInterview(
    workspace,
    formValue({ interviewedAt: new Date("2026-09-02T10:00:00") }),
  );
  workspace = upsertInterview(
    workspace,
    formValue({
      companyName: "青竹信息",
      interviewedAt: new Date("2026-08-29T10:00:00"),
    }),
  );
  // upsertInterview 用真实时钟推导状态，而本测试的 now 是固定日期：
  // 两条记录一律显式置为 scheduled，测试才不随日历推移而失效，
  // 同时覆盖"未来面试"和"到点未补录"两种场景。
  workspace = {
    ...workspace,
    interviews: workspace.interviews.map((item) => ({ ...item, status: "scheduled" })),
  };

  const result = upcomingInterviews(workspace, now);
  assert.equal(result.upcoming.length, 1);
  assert.equal(result.upcoming[0].companyName, "云帆科技");
  assert.equal(result.awaitingRecord.length, 1);
  assert.equal(result.awaitingRecord[0].companyName, "青竹信息");
});

test("applicationStageCounts 空工作台返回全零", () => {
  const counts = applicationStageCounts(createEmptyWorkspace());
  assert.equal(counts.applied, 0);
  assert.equal(counts.offer, 0);
});

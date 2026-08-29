import assert from "node:assert/strict";
import test from "node:test";

import {
  TRIAL_INTERVIEW_VERSION,
  buildTrialContext,
  completeTrialInterview,
  createTrialInterview,
  followUpCount,
  insertTrialFollowUp,
  isTrialInterview,
  mainQuestionCount,
  pendingEvaluationIndexes,
  recordTrialAnswer,
  recordTrialEvaluation,
  type TrialInterview,
} from "./interview";

/**
 * 体验版会话的状态迁移测试。这一层是纯函数，是体验版正确性的核心——
 * 服务端无状态，所有推进逻辑都在这里。
 */

const job = {
  companyName: "示例公司",
  jobTitle: "后端工程师",
  jobDescription: "负责服务端开发，熟悉缓存一致性与消息队列。",
};

const resume = {
  text: "三年后端开发经验，主技术栈 Go 与 MySQL。",
  projects: [
    {
      id: "trial-project-0",
      name: "订单中台",
      type: "project",
      organization: "某电商",
      description: "订单服务拆分与幂等设计。",
    },
  ],
};

function draft(index: number) {
  return {
    question: `第 ${index + 1} 题`,
    category: "technical",
    difficulty: "standard",
    sourceKind: "job_description",
    jobCompetencyId: "bp-1",
    jdEvidence: "JD 片段",
    relevanceScore: 0.9,
    resumeProjectId: null,
    personalizationSourceId: null,
    rationale: "考察点",
    expectedSignals: ["信号"],
    rubric: [{ name: "准确性", description: "是否正确", weight: 1 }],
  };
}

function newInterview(questionCount = 3): TrialInterview {
  return createTrialInterview({
    job,
    resume,
    blueprint: {
      summary: "岗位摘要",
      completeness: "complete",
      missingInformation: [],
      competencies: [
        {
          id: "bp-1",
          name: "缓存一致性",
          description: "描述",
          priority: "core",
          jdEvidence: "JD 片段",
          origin: "jd",
          sourceUrl: null,
        },
      ],
    },
    plan: {
      questions: Array.from({ length: questionCount }, (_, index) => draft(index)),
    } as never,
  });
}

test("builds an interview context without history or profile", () => {
  const context = buildTrialContext({ job, resume });

  assert.equal(context.jobDescription, job.jobDescription);
  assert.equal(context.resume.text, resume.text);
  assert.deepEqual(context.projects, resume.projects);
  // 体验版没有历史面试，也没有能力画像——出题只靠简历和 JD。
  assert.deepEqual(context.history, []);
  assert.deepEqual(context.profile, { revision: 0, insights: [] });
});

test("starts every question unanswered and unscored", () => {
  const interview = newInterview();

  assert.equal(interview.version, TRIAL_INTERVIEW_VERSION);
  assert.equal(interview.status, "in_progress");
  assert.equal(interview.currentIndex, 0);
  assert.equal(interview.questions.length, 3);
  assert.ok(interview.answers.every((item) => item === null));
  assert.ok(interview.evaluations.every((item) => item === null));
  // 出题时就带上 rubric，保证同一道题对所有回答用同一把尺子。
  assert.ok(interview.questions[0]!.rubric.length > 0);
});

test("advances the pointer and closes the interview after the last answer", () => {
  let interview = newInterview(2);

  interview = recordTrialAnswer(interview, 0, "第一题的回答");
  assert.equal(interview.currentIndex, 1);
  assert.equal(interview.status, "in_progress");

  interview = recordTrialAnswer(interview, 1, "第二题的回答");
  assert.equal(interview.currentIndex, 2);
  assert.equal(interview.status, "ready_to_evaluate");
});

test("ignores answers submitted out of order", () => {
  const interview = newInterview();
  // 重复提交或乱序提交不能把进度多推一格。
  assert.equal(recordTrialAnswer(interview, 2, "跳着答").currentIndex, 0);
  assert.equal(recordTrialAnswer(interview, 0, "答").currentIndex, 1);
});

test("records a skip distinctly from an unanswered question", () => {
  const interview = recordTrialAnswer(newInterview(), 0, null);

  // 跳过是空字符串、未作答是 null：交卷时前者不参与评分，后者会拦住交卷。
  assert.equal(interview.answers[0], "");
  assert.notEqual(interview.answers[0], null);
  assert.deepEqual(pendingEvaluationIndexes(interview), []);
});

test("inserts a follow-up right after its parent and shifts the rest", () => {
  let interview = newInterview(3);
  interview = recordTrialAnswer(interview, 0, "留有缺口的回答");
  interview = insertTrialFollowUp(interview, 0, {
    question: "追问：再展开一下",
    expectedSignals: ["更具体"],
  });

  assert.equal(interview.questions.length, 4);
  assert.equal(interview.questions[1]!.question, "追问：再展开一下");
  assert.equal(interview.questions[1]!.parentIndex, 0);
  // 后面的题整体后移，答案与评分数组同步对齐。
  assert.equal(interview.questions[2]!.question, "第 2 题");
  assert.equal(interview.answers.length, 4);
  assert.equal(interview.evaluations.length, 4);
  assert.equal(interview.answers[1], null);
  // 指针已经指向刚插入的追问，状态回到进行中。
  assert.equal(interview.currentIndex, 1);
  assert.equal(interview.status, "in_progress");
  // 追问继承父题的能力项与评分标准。
  assert.equal(interview.questions[1]!.jobCompetencyId, "bp-1");
  assert.deepEqual(interview.questions[1]!.rubric, interview.questions[0]!.rubric);
});

test("counts main questions and follow-ups separately for the budget", () => {
  let interview = newInterview(3);
  interview = recordTrialAnswer(interview, 0, "回答");
  interview = insertTrialFollowUp(interview, 0, {
    question: "追问",
    expectedSignals: [],
  });

  // 追问不占主题目配额，与本地版的追问预算口径一致。
  assert.equal(mainQuestionCount(interview), 3);
  assert.equal(followUpCount(interview), 1);
});

test("tracks which answered questions still need scoring", () => {
  let interview = newInterview(3);
  interview = recordTrialAnswer(interview, 0, "已答待评分");
  assert.deepEqual(pendingEvaluationIndexes(interview), [0]);

  interview = recordTrialEvaluation(interview, 0, {
    score: 80,
    feedback: "回答完整。",
    strengths: [],
    improvements: [],
    dimensions: [],
  });
  assert.deepEqual(pendingEvaluationIndexes(interview), []);
});

test("keeps the report on the completed interview", () => {
  const report = {
    totalScore: 80,
    summary: "整体不错。",
    strengths: ["优势"],
    improvements: ["改进"],
    actionPlan: ["行动"],
  };
  const interview = completeTrialInterview(newInterview(), report);

  assert.equal(interview.status, "completed");
  assert.deepEqual(interview.report, report);
});

test("rejects stored documents that do not match the current version", () => {
  const interview = newInterview();
  assert.equal(isTrialInterview(interview), true);
  // 版本不匹配一律丢弃重来：体验数据是一次性的，不值得写迁移。
  assert.equal(isTrialInterview({ ...interview, version: 0 }), false);
  assert.equal(isTrialInterview(null), false);
  assert.equal(isTrialInterview({ questions: [] }), false);
});

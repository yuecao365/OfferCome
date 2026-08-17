import assert from "node:assert/strict";
import test from "node:test";

import {
  looksLikeVerbatimTranscript,
  parseInterviewExchanges,
  reconstructGeneratedDraft,
  structureInterviewTextHeuristically,
} from "./draft";

test("recognizes a speaker-labelled transcript", () => {
  assert.equal(
    looksLikeVerbatimTranscript(`
面试官：请介绍一下你做过的项目？
我：我负责订单系统的重构。
面试官：遇到过什么难点？
我：主要是并发下的库存超卖。
`),
    true,
  );
});

test("locates questions even when the source text carries stray spaces", () => {
  // PDF 抽取常在词句中间夹带空格，模型复制时会去掉，仍要能对上原文。
  const source = "面试官： 请介绍一下 你负责的项目 ？\n我：我负责订单系统重构。";
  const draft = reconstructGeneratedDraft(
    source,
    {
      header: { companyName: null, jobTitle: null, round: null, interviewedAt: null },
      questions: [
        {
          question: "面试官：请介绍一下你负责的项目？",
          answerStartQuote: "我负责订单",
          answerEndQuote: "系统重构。",
          category: "general" as const,
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.8,
        },
      ],
    },
    [],
  );
  assert.equal(draft.questions.length, 1);
  // 取回的是原文片段，而不是模型改写后的文字。
  assert.equal(draft.questions[0]?.question, "面试官： 请介绍一下 你负责的项目 ？");
});

test("passes through a sanitized header for form prefill", () => {
  const draft = reconstructGeneratedDraft(
    "面试官：请介绍原始项目？我：完整回答。",
    {
      header: {
        companyName: "  示例科技  ",
        jobTitle: "前端工程师",
        round: "second_interview",
        interviewedAt: "2026-08-15 14:00",
      },
      questions: [
        {
          question: "请介绍原始项目？",
          answerStartQuote: "我：完整回答。",
          answerEndQuote: "我：完整回答。",
          category: "general" as const,
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.9,
        },
      ],
    },
    [],
  );

  assert.deepEqual(draft.header, {
    companyName: "示例科技",
    jobTitle: "前端工程师",
    round: "second_interview",
    interviewedAt: "2026-08-15 14:00",
  });
});

test("heuristic drafts always carry an empty header", () => {
  const draft = structureInterviewTextHeuristically(
    "问题：请介绍项目？\n回答：我负责重构。",
    [],
  );
  assert.deepEqual(draft.header, {
    companyName: null,
    jobTitle: null,
    round: null,
    interviewedAt: null,
  });
});

test("treats narrative review notes as a summary", () => {
  assert.equal(
    looksLikeVerbatimTranscript(`
今天面了一家做支付的公司，整体感觉一般。
对方主要问了分布式事务和幂等设计，我答得不够深入，
后面还聊到了团队规模和加班情况。
`),
    false,
  );
});

test("parses speaker-labelled interview questions and answers", () => {
  const exchanges = parseInterviewExchanges(`
面试官：请介绍一下你做过的项目？
候选人：我主要做过一个求职管理系统。
面试官：React 的状态更新为什么可能是异步的？
我：React 会对更新进行调度和批处理。
  `);

  assert.deepEqual(exchanges, [
    {
      question: "请介绍一下你做过的项目？",
      answer: "我主要做过一个求职管理系统。",
    },
    {
      question: "React 的状态更新为什么可能是异步的？",
      answer: "React 会对更新进行调度和批处理。",
    },
  ]);
});

test("classifies questions and links an explicitly mentioned project", () => {
  const draft = structureInterviewTextHeuristically(
    `问题：请介绍 Career Agent 项目？\n回答：这是一个求职管理系统。\n问题：浏览器缓存有哪些类型？\n回答：强缓存和协商缓存。`,
    [
      {
        id: "project-1",
        name: "Career Agent - Job Search Management",
        type: "project",
        organization: "",
      },
    ],
  );

  assert.equal(draft.provider, "heuristic");
  assert.equal(draft.questions.length, 2);
  assert.equal(draft.questions[0].category, "resume_project");
  assert.equal(draft.questions[0].relatedItemId, "project-1");
  assert.equal(draft.questions[1].category, "technical");
});

test("reconstructs complete answers verbatim from short model boundary quotes", () => {
  const firstAnswer =
    "候选人：这是回答开头。中间包含必须完整保留的大量项目背景、实现细节、困难和复盘内容。这是回答结尾。";
  const secondAnswer = "候选人：哈希表通过键快速查找值。这是第二个回答结尾。";
  const source = [
    "面试官：请完整介绍你的项目？",
    firstAnswer,
    "好的，我们继续下一题。面试官：什么是哈希表？",
    secondAnswer,
    "时间差不多了，感谢参与。",
  ].join("\n");

  const draft = reconstructGeneratedDraft(
    source,
    {
      header: { companyName: null, jobTitle: null, round: null, interviewedAt: null },
      questions: [
        {
          question: "请完整介绍你的项目？",
          answerStartQuote: "候选人：这是回答开头。",
          answerEndQuote: "这是回答结尾。",
          category: "resume_project",
          relatedItemId: "project-1",
          relatedItemName: "完整项目",
          confidence: 0.95,
        },
        {
          question: "什么是哈希表？",
          answerStartQuote: "候选人：哈希表通过键快速查找值。",
          answerEndQuote: "这是第二个回答结尾。",
          category: "technical",
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.9,
        },
      ],
    },
    [
      {
        id: "project-1",
        name: "完整项目",
        type: "project",
        organization: "",
      },
    ],
  );

  assert.equal(draft.questions.length, 2);
  assert.equal(draft.questions[0].answer, firstAnswer);
  assert.equal(draft.questions[1].answer, secondAnswer);
  assert.equal(source.includes(draft.questions[0].answer), true);
  assert.equal(draft.questions[0].relatedItemId, "project-1");
});

test("keeps unanswered questions empty", () => {
  const source = "问题一？问题二？候选人：第二题回答。";
  const draft = reconstructGeneratedDraft(
    source,
    {
      header: { companyName: null, jobTitle: null, round: null, interviewedAt: null },
      questions: [
        {
          question: "问题一？",
          answerStartQuote: null,
          answerEndQuote: null,
          category: "general",
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.9,
        },
        {
          question: "问题二？",
          answerStartQuote: "候选人：第二题回答。",
          answerEndQuote: "候选人：第二题回答。",
          category: "general",
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.9,
        },
      ],
    },
    [],
  );

  assert.equal(draft.questions[0].answer, "");
  assert.equal(draft.questions[1].answer, "候选人：第二题回答。");
});

test("reports rewritten questions instead of using the model's wording", () => {
  const draft = reconstructGeneratedDraft(
    "请介绍原始项目？候选人：完整回答。",
    {
      header: { companyName: null, jobTitle: null, round: null, interviewedAt: null },
      questions: [
        {
          question: "请简要介绍项目？",
          answerStartQuote: "候选人：完整回答。",
          answerEndQuote: "候选人：完整回答。",
          category: "resume_project",
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.6,
        },
      ],
    },
    [],
  );

  // 改写过的问题不会被采用，但也不能悄悄消失：要如实报出来。
  assert.deepEqual(draft.questions, []);
  assert.deepEqual(draft.unmatchedQuestions, ["请简要介绍项目？"]);
});

test("keeps the questions it can locate when only some fail to match", () => {
  const draft = reconstructGeneratedDraft(
    "面试官：请介绍原始项目？我：完整回答。面试官：还有什么难点？我：并发问题。",
    {
      header: { companyName: null, jobTitle: null, round: null, interviewedAt: null },
      questions: [
        {
          question: "请介绍原始项目？",
          answerStartQuote: "我：完整回答。",
          answerEndQuote: "我：完整回答。",
          category: "resume_project",
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.9,
        },
        {
          question: "这个问题原文里没有？",
          answerStartQuote: null,
          answerEndQuote: null,
          category: "general",
          relatedItemId: null,
          relatedItemName: null,
          confidence: 0.4,
        },
      ],
    },
    [],
  );

  // 一条定位失败不该作废整份草稿。
  assert.equal(draft.questions.length, 1);
  assert.equal(draft.questions[0]?.question, "请介绍原始项目？");
  assert.equal(draft.unmatchedQuestions.length, 1);
});

import { defineMessages, type Locale } from "@/lib/i18n/locale";

import type { InterviewQuestionInput } from "./types";

const messages = defineMessages({
  "zh-CN": {
    foreign: "问题不属于当前面试，无法保存修改。",
    duplicate: "同一个问题不能在面试中重复出现。",
  },
  en: {
    foreign: "A question doesn't belong to this interview, so the changes can't be saved.",
    duplicate: "The same question can't appear twice in one interview.",
  },
});

export type ExistingInterviewQuestion = {
  id: string;
};

export type InterviewQuestionUpdate = InterviewQuestionInput & {
  id: string;
};

export type InterviewQuestionDiff = {
  toUpdate: InterviewQuestionUpdate[];
  toCreate: InterviewQuestionInput[];
  toDeleteIds: string[];
};

export function diffInterviewQuestions(
  existing: ExistingInterviewQuestion[],
  incoming: InterviewQuestionInput[],
  locale: Locale = "zh-CN",
): InterviewQuestionDiff {
  const existingIds = new Set(existing.map((question) => question.id));
  const retainedIds = new Set<string>();
  const toUpdate: InterviewQuestionUpdate[] = [];
  const toCreate: InterviewQuestionInput[] = [];

  for (const question of incoming) {
    if (!question.id) {
      toCreate.push(question);
      continue;
    }

    if (!existingIds.has(question.id)) {
      throw new Error(messages[locale].foreign);
    }
    if (retainedIds.has(question.id)) {
      throw new Error(messages[locale].duplicate);
    }

    retainedIds.add(question.id);
    toUpdate.push({ ...question, id: question.id });
  }

  return {
    toUpdate,
    toCreate,
    toDeleteIds: existing
      .filter((question) => !retainedIds.has(question.id))
      .map((question) => question.id),
  };
}

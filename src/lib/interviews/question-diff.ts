import type { InterviewQuestionInput } from "./types";

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
      throw new Error("问题不属于当前面试，无法保存修改。");
    }
    if (retainedIds.has(question.id)) {
      throw new Error("同一个问题不能在面试中重复出现。");
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

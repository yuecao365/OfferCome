"use client";

import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS_I18N,
  type InterviewQuestionCategory,
  type InterviewQuestionInput,
  type ResumeProjectOption,
} from "@/lib/interviews/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RequiredMark, Select, Textarea } from "@/components/ui/form-controls";

const messages = defineMessages({
  "zh-CN": {
    title: "问题与回答",
    add: "添加问题",
    empty: "还没有问题，点击添加问题开始记录。",
    question: (n: number) => `问题 ${n}`,
    confidence: (percent: number) => `识别置信度 ${percent}%`,
    remove: "删除",
    questionPlaceholder: "输入面试问题",
    categoryAria: (n: number) => `问题 ${n} 类型`,
    projectAria: (n: number) => `问题 ${n} 关联实习/项目`,
    noProject: "未关联实习/项目",
    answerAria: (n: number) => `问题 ${n} 回答`,
    answerPlaceholder: "输入回答，可稍后补充",
  },
  en: {
    title: "Questions and answers",
    add: "Add question",
    empty: "No questions yet. Click Add question to start.",
    question: (n: number) => `Question ${n}`,
    confidence: (percent: number) => `Recognition confidence ${percent}%`,
    remove: "Delete",
    questionPlaceholder: "Enter the interview question",
    categoryAria: (n: number) => `Question ${n} type`,
    projectAria: (n: number) => `Question ${n} linked internship / project`,
    noProject: "No linked internship / project",
    answerAria: (n: number) => `Question ${n} answer`,
    answerPlaceholder: "Enter your answer — you can fill it in later",
  },
});

type InterviewQuestionsEditorProps = {
  onChange: (questions: InterviewQuestionInput[]) => void;
  questions: InterviewQuestionInput[];
  resumeProjects: ResumeProjectOption[];
};

type EditableQuestionField =
  | "question"
  | "answer"
  | "category"
  | "resumeProjectId";

export function InterviewQuestionsEditor({
  onChange,
  questions,
  resumeProjects,
}: InterviewQuestionsEditorProps) {
  const locale = useLocale();
  const t = useMessages(messages);
  const updateQuestion = (
    index: number,
    field: EditableQuestionField,
    value: string | null,
  ) => {
    onChange(
      questions.map((question, currentIndex) => {
        if (currentIndex !== index) return question;

        if (field === "category") {
          const category = value as InterviewQuestionCategory;
          return {
            ...question,
            category,
            resumeProjectId:
              category === "resume_project" ? question.resumeProjectId : null,
          };
        }

        return { ...question, [field]: value };
      }),
    );
  };

  const removeQuestion = (index: number) => {
    onChange(
      questions
        .filter((_, currentIndex) => currentIndex !== index)
        .map((question, currentIndex) => ({
          ...question,
          sortOrder: currentIndex,
        })),
    );
  };

  const addQuestion = () => {
    onChange([
      ...questions,
      {
        question: "",
        answer: "",
        category: "general",
        resumeProjectId: null,
        sortOrder: questions.length,
      },
    ]);
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2">
        <h3 className="text-sm font-medium text-zinc-900">{t.title}</h3>
        <Button
          onClick={addQuestion}
          size="sm"
          type="button"
          variant="outline"
        >
          {t.add}
        </Button>
      </div>
      <div className="grid gap-3 p-3">
        {questions.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.empty}</p>
        ) : null}
        {questions.map((question, index) => (
          <div
            className="grid gap-2 rounded border border-zinc-200 p-3"
            key={question.id ?? question.sortOrder}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-800">
                {t.question(index + 1)}
                {questions.length === 1 ? <RequiredMark /> : null}
                {typeof question.confidence === "number" ? (
                  <span className="ml-2 font-normal text-zinc-500">
                    {t.confidence(Math.round(question.confidence * 100))}
                  </span>
                ) : null}
              </p>
              <Button
                onClick={() => removeQuestion(index)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t.remove}
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <Textarea
                aria-label={t.question(index + 1)}
                className="min-h-20 resize-y"
                onChange={(event) =>
                  updateQuestion(index, "question", event.target.value)
                }
                placeholder={t.questionPlaceholder}
                required={questions.length === 1}
                rows={2}
                value={question.question}
              />
              <Select
                aria-label={t.categoryAria(index + 1)}
                onChange={(event) =>
                  updateQuestion(index, "category", event.target.value)
                }
                value={question.category}
              >
                {INTERVIEW_QUESTION_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {INTERVIEW_QUESTION_CATEGORY_LABELS_I18N[locale][category]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={t.projectAria(index + 1)}
                disabled={question.category !== "resume_project"}
                onChange={(event) =>
                  updateQuestion(
                    index,
                    "resumeProjectId",
                    event.target.value || null,
                  )
                }
                value={question.resumeProjectId ?? ""}
              >
                <option value="">{t.noProject}</option>
                {resumeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              aria-label={t.answerAria(index + 1)}
              className="min-h-40 resize-y"
              onChange={(event) =>
                updateQuestion(index, "answer", event.target.value)
              }
              placeholder={t.answerPlaceholder}
              rows={6}
              value={question.answer}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

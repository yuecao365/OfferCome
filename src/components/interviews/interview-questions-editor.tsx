"use client";

import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS,
  type InterviewQuestionCategory,
  type InterviewQuestionInput,
  type ResumeProjectOption,
} from "@/lib/interviews/types";

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
    <section className="rounded border border-zinc-200">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2">
        <h3 className="text-sm font-medium text-zinc-900">问题与回答</h3>
        <button
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          onClick={addQuestion}
          type="button"
        >
          添加问题
        </button>
      </div>
      <div className="grid gap-3 p-3">
        {questions.length === 0 ? (
          <p className="text-sm text-zinc-500">还没有问题，点击添加问题开始记录。</p>
        ) : null}
        {questions.map((question, index) => (
          <div
            className="grid gap-2 rounded border border-zinc-200 p-3"
            key={question.id ?? question.sortOrder}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-800">
                问题 {index + 1}
                {typeof question.confidence === "number" ? (
                  <span className="ml-2 font-normal text-zinc-500">
                    识别置信度 {Math.round(question.confidence * 100)}%
                  </span>
                ) : null}
              </p>
              <button
                className="text-sm font-medium text-red-700 hover:text-red-800"
                onClick={() => removeQuestion(index)}
                type="button"
              >
                删除
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <textarea
                aria-label={`问题 ${index + 1}`}
                className="min-h-20 resize-y rounded border border-zinc-300 px-3 py-3 text-sm leading-6"
                onChange={(event) =>
                  updateQuestion(index, "question", event.target.value)
                }
                placeholder="输入面试问题"
                required={questions.length === 1}
                rows={2}
                value={question.question}
              />
              <select
                aria-label={`问题 ${index + 1} 类型`}
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
                onChange={(event) =>
                  updateQuestion(index, "category", event.target.value)
                }
                value={question.category}
              >
                {INTERVIEW_QUESTION_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {INTERVIEW_QUESTION_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`问题 ${index + 1} 关联实习/项目`}
                className="rounded border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
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
                <option value="">未关联实习/项目</option>
                {resumeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              aria-label={`问题 ${index + 1} 回答`}
              className="min-h-40 resize-y rounded border border-zinc-300 px-3 py-3 text-sm leading-6"
              onChange={(event) =>
                updateQuestion(index, "answer", event.target.value)
              }
              placeholder="输入回答，可稍后补充"
              rows={6}
              value={question.answer}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

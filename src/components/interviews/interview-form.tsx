"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  createInterview,
  updateInterview,
} from "@/lib/interviews/actions";
import {
  INTERVIEW_ROUND_LABELS,
  INTERVIEW_ROUNDS,
  initialInterviewActionState,
  type InterviewActionState,
  type InterviewListItem,
  type InterviewQuestionInput,
  type ResumeProjectOption,
} from "@/lib/interviews/types";

import { InterviewDraftImporter } from "./interview-draft-importer";
import { InterviewQuestionsEditor } from "./interview-questions-editor";

type InterviewFormProps =
  | {
      mode: "create";
      initial?: never;
      onCancel?: () => void;
      resumeProjects: ResumeProjectOption[];
      onSaved?: () => void;
    }
  | {
      mode: "edit";
      initial: InterviewListItem;
      onCancel?: () => void;
      resumeProjects: ResumeProjectOption[];
      onSaved?: () => void;
    };

type InterviewServerAction = (
  state: InterviewActionState,
  formData: FormData,
) => Promise<InterviewActionState>;

function toDatetimeLocal(date: Date | null): string {
  if (!date) {
    return "";
  }

  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
      disabled={pending}
      type="submit"
    >
      {pending ? "保存中..." : label}
    </button>
  );
}

function initialQuestions(initial?: InterviewListItem): InterviewQuestionInput[] {
  if (!initial || initial.questions.length === 0) {
    return [
      {
        question: "",
        answer: "",
        category: "general",
        resumeProjectId: null,
        sortOrder: 0,
      },
    ];
  }

  return initial.questions.map((question, index) => ({
    question: question.question,
    answer: question.answer,
    category: question.category,
    resumeProjectId: question.resumeProjectId,
    sortOrder: index,
  }));
}

export function InterviewForm(props: InterviewFormProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<InterviewQuestionInput[]>(
    initialQuestions(props.mode === "edit" ? props.initial : undefined),
  );
  const editInterviewId = props.mode === "edit" ? props.initial.id : null;
  const onSaved = props.onSaved;
  const action = useMemo<InterviewServerAction>(() => {
    if (editInterviewId) {
      return updateInterview.bind(null, editInterviewId);
    }
    return createInterview;
  }, [editInterviewId]);
  const [state, formAction] = useActionState(action, initialInterviewActionState);
  const initial = props.mode === "edit" ? props.initial : null;

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    onSaved?.();
    router.refresh();
  }, [onSaved, router, state.status]);

  return (
    <form action={formAction} className="grid gap-4">
      <input
        name="questionsJson"
        type="hidden"
        value={JSON.stringify(questions)}
      />
      {props.mode === "create" ? (
        <InterviewDraftImporter
          onDraft={(draftQuestions) => setQuestions(draftQuestions)}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-800">
            公司名称
            <input
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              defaultValue={initial?.companyName ?? ""}
              name="companyName"
              required
            />
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-800">
            工作岗位
            <input
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              defaultValue={initial?.jobTitle ?? ""}
              name="jobTitle"
              required
            />
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-800">
            面试时间
            <input
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              defaultValue={toDatetimeLocal(initial?.interviewedAt ?? null)}
              name="interviewedAt"
              required
              type="datetime-local"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-zinc-800">
          轮次/类型
          <select
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            defaultValue={initial?.round ?? ""}
            name="round"
          >
            <option value="">未设置</option>
            {INTERVIEW_ROUNDS.map((round) => (
              <option key={round} value={round}>
                {INTERVIEW_ROUND_LABELS[round]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-zinc-800">
        备注
        <textarea
          className="mt-1 block min-h-20 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          defaultValue={initial?.note ?? ""}
          name="note"
        />
      </label>

      <InterviewQuestionsEditor
        onChange={setQuestions}
        questions={questions}
        resumeProjects={props.resumeProjects}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          onClick={props.onCancel}
          type="button"
        >
          取消
        </button>
        <SubmitButton label={props.mode === "edit" ? "保存修改" : "新建面试"} />
        {state.message ? (
          <p
            aria-live="polite"
            className={[
              "text-sm",
              state.status === "error" ? "text-red-700" : "text-zinc-700",
            ].join(" ")}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

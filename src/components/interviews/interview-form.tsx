"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";

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
      transcriptionConfigured: boolean;
    }
  | {
      mode: "edit";
      initial: InterviewListItem;
      onCancel?: () => void;
      resumeProjects: ResumeProjectOption[];
      onSaved?: () => void;
      transcriptionConfigured?: boolean;
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
    <Button
      disabled={pending}
      type="submit"
    >
      {pending ? "保存中..." : label}
    </Button>
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
    id: question.id,
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
          transcriptionConfigured={props.transcriptionConfigured}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <FieldLabel>
            公司名称
            <Input
              defaultValue={initial?.companyName ?? ""}
              name="companyName"
              required
            />
          </FieldLabel>
        </div>
        <div>
          <FieldLabel>
            工作岗位
            <Input
              defaultValue={initial?.jobTitle ?? ""}
              name="jobTitle"
              required
            />
          </FieldLabel>
        </div>
        <div>
          <FieldLabel>
            面试时间
            <Input
              defaultValue={toDatetimeLocal(initial?.interviewedAt ?? null)}
              name="interviewedAt"
              required
              type="datetime-local"
            />
          </FieldLabel>
        </div>
        <FieldLabel>
          轮次/类型
          <Select
            defaultValue={initial?.round ?? ""}
            name="round"
          >
            <option value="">未设置</option>
            {INTERVIEW_ROUNDS.map((round) => (
              <option key={round} value={round}>
                {INTERVIEW_ROUND_LABELS[round]}
              </option>
            ))}
          </Select>
        </FieldLabel>
      </div>

      <FieldLabel>
        备注
        <Textarea
          className="min-h-20"
          defaultValue={initial?.note ?? ""}
          name="note"
        />
      </FieldLabel>

      <InterviewQuestionsEditor
        onChange={setQuestions}
        questions={questions}
        resumeProjects={props.resumeProjects}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={props.onCancel}
          type="button"
          variant="outline"
        >
          取消
        </Button>
        <SubmitButton label={props.mode === "edit" ? "保存修改" : "新建面试"} />
        {state.message ? (
          <Alert aria-live="polite" tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert>
        ) : null}
      </div>
    </form>
  );
}

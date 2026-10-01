"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  FieldLabel,
  Input,
  RequiredMark,
  Select,
  Textarea,
} from "@/components/ui/form-controls";

import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  createInterview,
  updateInterview,
} from "@/lib/interviews/actions";
import type { InterviewDraftHeader } from "@/lib/interviews/draft";
import {
  INTERVIEW_ROUND_LABELS_I18N,
  INTERVIEW_ROUNDS,
  initialInterviewActionState,
  type InterviewActionState,
  type InterviewListItem,
  type InterviewQuestionInput,
  type ResumeProjectOption,
} from "@/lib/interviews/types";

import { InterviewDraftImporter } from "./interview-draft-importer";
import { InterviewQuestionsEditor } from "./interview-questions-editor";

const messages = defineMessages({
  "zh-CN": {
    saving: "保存中...",
    requiredPrefix: "带 ",
    requiredSuffix: " 的为必填项。",
    companyName: "公司名称",
    jobTitle: "工作岗位",
    interviewedAt: "面试时间",
    round: "轮次/类型",
    unset: "未设置",
    note: "备注",
    scheduledHint: "面试时间在未来，将保存为待面试。面试结束后回来补充问答，这场面试就会计入复盘和能力画像。",
    cancel: "取消",
    saveChanges: "保存修改",
    create: "新建面试",
  },
  en: {
    saving: "Saving...",
    requiredPrefix: "Fields marked ",
    requiredSuffix: " are required.",
    companyName: "Company",
    jobTitle: "Role",
    interviewedAt: "Interview time",
    round: "Round / type",
    unset: "Not set",
    note: "Notes",
    scheduledHint: "This interview is in the future, so it will be saved as upcoming. Come back afterwards to add the questions and answers, and it will count toward your review and capability profile.",
    cancel: "Cancel",
    saveChanges: "Save changes",
    create: "Add interview",
  },
});

/** 从投递记录发起时带入的岗位信息，避免用户重复输入。 */
export type InterviewPrefill = {
  companyName: string;
  jobTitle: string;
  applicationId: string | null;
};

type InterviewFormProps =
  | {
      mode: "create";
      initial?: never;
      onCancel?: () => void;
      resumeProjects: ResumeProjectOption[];
      onSaved?: () => void;
      transcriptionConfigured: boolean;
      prefill?: InterviewPrefill | null;
      /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
      action?: InterviewServerAction;
      /** 体验版关闭导入：录音/文本识别依赖服务端转写与落盘。 */
      draftImportEnabled?: boolean;
    }
  | {
      mode: "edit";
      initial: InterviewListItem;
      onCancel?: () => void;
      resumeProjects: ResumeProjectOption[];
      onSaved?: () => void;
      transcriptionConfigured?: boolean;
      prefill?: never;
      action?: InterviewServerAction;
      draftImportEnabled?: boolean;
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
  const t = useMessages(messages);

  return (
    <Button
      disabled={pending}
      type="submit"
    >
      {pending ? t.saving : label}
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
  const locale = useLocale();
  const t = useMessages(messages);
  const [questions, setQuestions] = useState<InterviewQuestionInput[]>(
    initialQuestions(props.mode === "edit" ? props.initial : undefined),
  );
  const editInterviewId = props.mode === "edit" ? props.initial.id : null;
  const onSaved = props.onSaved;
  const override = props.action;
  const action = useMemo<InterviewServerAction>(() => {
    if (override) return override;
    if (editInterviewId) {
      return updateInterview.bind(null, editInterviewId);
    }
    return createInterview;
  }, [editInterviewId, override]);
  const [state, formAction] = useActionState(action, initialInterviewActionState);
  const initial = props.mode === "edit" ? props.initial : null;
  const prefill = props.mode === "create" ? props.prefill ?? null : null;
  const [companyName, setCompanyName] = useState(
    initial?.companyName ?? prefill?.companyName ?? "",
  );
  const [jobTitle, setJobTitle] = useState(
    initial?.jobTitle ?? prefill?.jobTitle ?? "",
  );
  const [round, setRound] = useState(initial?.round ?? "");
  const [interviewedAt, setInterviewedAt] = useState(
    toDatetimeLocal(initial?.interviewedAt ?? null),
  );

  // 草稿识别顺带提取的头部信息只补空缺，绝不覆盖用户已经填写的内容。
  const applyDraftHeader = (header: InterviewDraftHeader | null) => {
    if (!header) return;
    if (header.companyName) setCompanyName((value) => value || header.companyName!);
    if (header.jobTitle) setJobTitle((value) => value || header.jobTitle!);
    if (header.round) setRound((value) => value || header.round!);
    if (header.interviewedAt) {
      const withTime = header.interviewedAt.includes(" ")
        ? header.interviewedAt.replace(" ", "T")
        : `${header.interviewedAt}T00:00`;
      setInterviewedAt((value) => value || withTime);
    }
  };
  // 只用于提示文案，打开表单时取一次即可。
  const [referenceNow] = useState(() => Date.now());
  const isScheduled =
    Boolean(interviewedAt) && new Date(interviewedAt).getTime() > referenceNow;

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
      {prefill?.applicationId ? (
        <input name="applicationId" type="hidden" value={prefill.applicationId} />
      ) : null}
      {props.mode === "create" && props.draftImportEnabled !== false ? (
        <InterviewDraftImporter
          onDraft={(draftQuestions, header) => {
            setQuestions(draftQuestions);
            applyDraftHeader(header);
          }}
          transcriptionConfigured={props.transcriptionConfigured}
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t.requiredPrefix}<RequiredMark />{t.requiredSuffix}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <FieldLabel>
            <span>
              {t.companyName}
              <RequiredMark />
            </span>
            <Input
              name="companyName"
              onChange={(event) => setCompanyName(event.target.value)}
              required
              value={companyName}
            />
          </FieldLabel>
        </div>
        <div>
          <FieldLabel>
            <span>
              {t.jobTitle}
              <RequiredMark />
            </span>
            <Input
              name="jobTitle"
              onChange={(event) => setJobTitle(event.target.value)}
              required
              value={jobTitle}
            />
          </FieldLabel>
        </div>
        <div>
          <FieldLabel>
            <span>
              {t.interviewedAt}
              <RequiredMark />
            </span>
            <Input
              name="interviewedAt"
              onChange={(event) => setInterviewedAt(event.target.value)}
              required
              type="datetime-local"
              value={interviewedAt}
            />
          </FieldLabel>
        </div>
        <FieldLabel>
          {t.round}
          <Select
            name="round"
            onChange={(event) => setRound(event.target.value)}
            value={round}
          >
            <option value="">{t.unset}</option>
            {INTERVIEW_ROUNDS.map((round) => (
              <option key={round} value={round}>
                {INTERVIEW_ROUND_LABELS_I18N[locale][round]}
              </option>
            ))}
          </Select>
        </FieldLabel>
      </div>

      <FieldLabel>
        {t.note}
        <Textarea
          className="min-h-20"
          defaultValue={initial?.note ?? ""}
          name="note"
        />
      </FieldLabel>

      {isScheduled ? (
        <Alert tone="info">
          {t.scheduledHint}
        </Alert>
      ) : null}

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
          {t.cancel}
        </Button>
        <SubmitButton label={props.mode === "edit" ? t.saveChanges : t.create} />
        {state.message ? (
          <Alert aria-live="polite" tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert>
        ) : null}
      </div>
    </form>
  );
}

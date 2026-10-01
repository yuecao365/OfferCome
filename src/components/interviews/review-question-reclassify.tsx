"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/cn";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { reclassifyInterviewQuestions } from "@/lib/interviews/actions";
import {
  parseQuestionClassificationValue,
  projectClassificationValue,
  questionClassificationValue,
  UNLINKED_PROJECT_VALUE,
} from "@/lib/interviews/review";
import {
  INTERVIEW_QUESTION_CATEGORY_LABELS_I18N,
  type InterviewQuestionCategory,
} from "@/lib/interviews/types";

const messages = defineMessages({
  "zh-CN": {
    unlinked: "未关联项目",
    current: (label: string) => `归类：${label}`,
    adjust: "调整",
    moveTo: "归类到",
    questionBank: "通用问题库",
    moving: "移动中...",
    move: (n: number) => `移动 ${n} 条记录`,
    cancel: "取消",
  },
  en: {
    unlinked: "Unlinked",
    current: (label: string) => `Category: ${label}`,
    adjust: "Change",
    moveTo: "Move to",
    questionBank: "General question bank",
    moving: "Moving...",
    move: (n: number) => `Move ${n} record${n === 1 ? "" : "s"}`,
    cancel: "Cancel",
  },
});

export type ReclassifyProjectOption = {
  id: string;
  label: string;
};

type ReviewQuestionReclassifyProps = {
  questionIds: string[];
  category: InterviewQuestionCategory;
  resumeProjectId: string | null;
  projects: ReclassifyProjectOption[];
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  action?: typeof reclassifyInterviewQuestions;
};

/**
 * 改一组历史题目的归类：挂到别的实习/项目，或整体移进通用问题库。
 * 复盘里一条记录代表聚合后的多次提问，所以一次提交覆盖全部来源记录。
 */
export function ReviewQuestionReclassify({
  questionIds,
  category,
  resumeProjectId,
  projects,
  action = reclassifyInterviewQuestions,
}: ReviewQuestionReclassifyProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useMessages(messages);
  const labels = INTERVIEW_QUESTION_CATEGORY_LABELS_I18N[locale];
  const selectId = useId();
  const currentValue = questionClassificationValue({ category, resumeProjectId });
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [message, setMessage] = useState<{
    status: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const changed = value !== currentValue;

  function handleSubmit() {
    startTransition(async () => {
      const result = await action({
        questionIds,
        ...parseQuestionClassificationValue(value),
      });
      setMessage({ status: result.status, text: result.message });

      if (result.status === "success") {
        setOpen(false);
        router.refresh();
      }
    });
  }

  const currentLabel =
    category === "resume_project"
      ? projects.find((project) => project.id === resumeProjectId)?.label ??
        t.unlinked
      : labels[category];

  if (!open) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t.current(currentLabel)}</span>
        <button
          className="font-semibold text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          onClick={() => setOpen(true)}
          type="button"
        >
          {t.adjust}
        </button>
        {message ? (
          <span
            aria-live="polite"
            className={cn(
              message.status === "error" ? "text-danger" : "text-muted-foreground",
            )}
          >
            {message.text}
          </span>
        ) : null}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor={selectId}>{t.moveTo}</label>
      <Select
        className="h-8 w-auto min-w-52 max-w-full text-xs"
        disabled={isPending}
        id={selectId}
        onChange={(event) => setValue(event.target.value)}
        value={value}
      >
        <optgroup label={labels.resume_project}>
          {projects.map((project) => (
            <option key={project.id} value={projectClassificationValue(project.id)}>
              {project.label}
            </option>
          ))}
          <option value={UNLINKED_PROJECT_VALUE}>{t.unlinked}</option>
        </optgroup>
        <optgroup label={t.questionBank}>
          <option value="technical">
            {labels.technical}
          </option>
          <option value="general">
            {labels.general}
          </option>
        </optgroup>
      </Select>
      <Button
        disabled={!changed || isPending}
        onClick={handleSubmit}
        size="sm"
        variant="outline"
      >
        {isPending ? t.moving : t.move(questionIds.length)}
      </Button>
      <button
        className="font-semibold text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
        disabled={isPending}
        onClick={() => {
          setValue(currentValue);
          setOpen(false);
        }}
        type="button"
      >
        {t.cancel}
      </button>
      {message?.status === "error" ? (
        <span aria-live="polite" className="text-danger">
          {message.text}
        </span>
      ) : null}
    </div>
  );
}

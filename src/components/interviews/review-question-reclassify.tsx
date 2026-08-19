"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/cn";
import { reclassifyInterviewQuestions } from "@/lib/interviews/actions";
import {
  parseQuestionClassificationValue,
  projectClassificationValue,
  questionClassificationValue,
  UNLINKED_PROJECT_VALUE,
} from "@/lib/interviews/review";
import {
  INTERVIEW_QUESTION_CATEGORY_LABELS,
  type InterviewQuestionCategory,
} from "@/lib/interviews/types";

export type ReclassifyProjectOption = {
  id: string;
  label: string;
};

type ReviewQuestionReclassifyProps = {
  questionIds: string[];
  category: InterviewQuestionCategory;
  resumeProjectId: string | null;
  projects: ReclassifyProjectOption[];
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
}: ReviewQuestionReclassifyProps) {
  const router = useRouter();
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
      const result = await reclassifyInterviewQuestions({
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
        "未关联项目"
      : INTERVIEW_QUESTION_CATEGORY_LABELS[category];

  if (!open) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>归类：{currentLabel}</span>
        <button
          className="font-semibold text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          onClick={() => setOpen(true)}
          type="button"
        >
          调整
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
      <label htmlFor={selectId}>归类到</label>
      <Select
        className="h-8 w-auto min-w-52 max-w-full text-xs"
        disabled={isPending}
        id={selectId}
        onChange={(event) => setValue(event.target.value)}
        value={value}
      >
        <optgroup label={INTERVIEW_QUESTION_CATEGORY_LABELS.resume_project}>
          {projects.map((project) => (
            <option key={project.id} value={projectClassificationValue(project.id)}>
              {project.label}
            </option>
          ))}
          <option value={UNLINKED_PROJECT_VALUE}>未关联项目</option>
        </optgroup>
        <optgroup label="通用问题库">
          <option value="technical">
            {INTERVIEW_QUESTION_CATEGORY_LABELS.technical}
          </option>
          <option value="general">
            {INTERVIEW_QUESTION_CATEGORY_LABELS.general}
          </option>
        </optgroup>
      </Select>
      <Button
        disabled={!changed || isPending}
        onClick={handleSubmit}
        size="sm"
        variant="outline"
      >
        {isPending ? "移动中..." : `移动 ${questionIds.length} 条记录`}
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
        取消
      </button>
      {message?.status === "error" ? (
        <span aria-live="polite" className="text-danger">
          {message.text}
        </span>
      ) : null}
    </div>
  );
}

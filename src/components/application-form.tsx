"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  FieldLabel,
  Input,
  RequiredMark,
  Select,
  Textarea,
} from "@/components/ui/form-controls";
import {
  createApplication,
  updateApplication,
} from "@/lib/applications/actions";
import {
  initialApplicationActionState,
  type ApplicationActionState,
} from "@/lib/applications/action-state";
import {
  APPLICATION_STAGES,
  MAX_JOB_DESCRIPTION_LENGTH,
  stageLabel,
  type ApplicationListItem,
} from "@/lib/applications/types";

type ApplicationFormProps =
  | {
      mode: "create";
      initial?: never;
      onCancel?: () => void;
      onSaved?: () => void;
      /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
      action?: ApplicationServerAction;
    }
  | {
      mode: "edit";
      initial: ApplicationListItem;
      onCancel?: () => void;
      onSaved?: () => void;
      action?: ApplicationServerAction;
    };

type ApplicationServerAction = (
  state: ApplicationActionState,
  formData: FormData,
) => Promise<ApplicationActionState>;

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
    <Button disabled={pending} type="submit">
      {pending ? "保存中..." : label}
    </Button>
  );
}

export function ApplicationForm(props: ApplicationFormProps) {
  const router = useRouter();
  const editId = props.mode === "edit" ? props.initial.id : null;
  const override = props.action;
  const action = useMemo<ApplicationServerAction>(
    () =>
      override ?? (editId ? updateApplication.bind(null, editId) : createApplication),
    [editId, override],
  );
  const [state, formAction] = useActionState(
    action,
    initialApplicationActionState,
  );
  const initial = props.mode === "edit" ? props.initial : null;

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    props.onSaved?.();
    router.refresh();
  }, [props, router, state.status]);

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <FieldLabel>
          <span>公司名称<RequiredMark /></span>
          <Input
            defaultValue={initial?.companyName ?? ""}
            name="companyName"
            required
          />
        </FieldLabel>
        <FieldLabel>
          <span>岗位名称<RequiredMark /></span>
          <Input
            defaultValue={initial?.jobTitle ?? ""}
            name="jobTitle"
            required
          />
        </FieldLabel>
        <FieldLabel>
          <span>投递时间<RequiredMark /></span>
          <Input
            defaultValue={toDatetimeLocal(initial?.appliedAt ?? new Date())}
            name="appliedAt"
            required
            type="datetime-local"
          />
        </FieldLabel>
        <FieldLabel>
          <span>当前流程状态<RequiredMark /></span>
          <Select
            defaultValue={initial?.stage ?? "applied"}
            name="stage"
            required
          >
            {APPLICATION_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
          </Select>
        </FieldLabel>
        <FieldLabel>
          来源
          <Input
            defaultValue={initial?.source ?? "manual"}
            name="source"
            placeholder="manual"
          />
        </FieldLabel>
        <FieldLabel>
          岗位链接
          <Input
            defaultValue={initial?.jobUrl ?? ""}
            name="jobUrl"
            placeholder="https://..."
            type="url"
          />
        </FieldLabel>
      </div>
      <FieldLabel>
        岗位描述
        <Textarea
          className="min-h-28"
          defaultValue={initial?.jobDescription ?? ""}
          maxLength={MAX_JOB_DESCRIPTION_LENGTH}
          name="jobDescription"
          placeholder="粘贴岗位职责与任职要求，之后发起模拟面试时会自动带入。"
          rows={5}
        />
      </FieldLabel>
      <FieldLabel>
        备注
        <Textarea
          className="min-h-20"
          defaultValue={initial?.note ?? ""}
          name="note"
          rows={3}
        />
      </FieldLabel>

      <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-5 py-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
        <Button onClick={props.onCancel} variant="outline">
          取消
        </Button>
        <SubmitButton label={props.mode === "edit" ? "保存修改" : "新建投递"} />
        {state.message ? (
          <p
            aria-live="polite"
            className={[
              "text-sm",
              state.status === "error" ? "text-danger-strong" : "text-success-strong",
            ].join(" ")}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

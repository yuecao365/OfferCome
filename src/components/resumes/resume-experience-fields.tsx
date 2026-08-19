"use client";

import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";
import { normalizeExperienceType } from "@/lib/resumes/confirmation";
import type { ResumeExperienceType } from "@/lib/resumes/extract";

export type ResumeExperienceFieldsValue = {
  type: ResumeExperienceType;
  name: string;
  organization: string | null;
  description: string | null;
};

type ResumeExperienceFieldsProps = {
  value: ResumeExperienceFieldsValue;
  onChange: (patch: Partial<ResumeExperienceFieldsValue>) => void;
  disabled?: boolean;
  /** Prefix for the generated aria labels so multiple editors stay distinguishable. */
  label: string;
};

/**
 * Editable fields shared by the upload confirmation panel and the saved
 * internship/project editor, so both surfaces stay in sync.
 */
export function ResumeExperienceFields({
  value,
  onChange,
  disabled,
  label,
}: ResumeExperienceFieldsProps) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
        <FieldLabel>
          类型
          <Select
            aria-label={`${label} 类型`}
            disabled={disabled}
            onChange={(event) =>
              onChange({ type: normalizeExperienceType(event.target.value) })
            }
            value={value.type}
          >
            <option value="internship">实习</option>
            <option value="project">项目</option>
          </Select>
        </FieldLabel>
        <FieldLabel>
          名称
          <Input
            aria-label={`${label} 名称`}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={value.type === "internship" ? "岗位或实习名称" : "项目名称"}
            value={value.name}
          />
        </FieldLabel>
      </div>
      <FieldLabel>
        公司 / 组织
        <Input
          aria-label={`${label} 公司或组织`}
          disabled={disabled}
          onChange={(event) => onChange({ organization: event.target.value })}
          placeholder="选填"
          value={value.organization ?? ""}
        />
      </FieldLabel>
      <FieldLabel>
        描述
        <Textarea
          aria-label={`${label} 描述`}
          className="min-h-20 resize-y"
          disabled={disabled}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="选填，用于生成面试题的素材"
          rows={3}
          value={value.description ?? ""}
        />
      </FieldLabel>
    </div>
  );
}

/** Delete confirmation copy shared by every place that removes an internship/project. */
export function resumeProjectDeleteMessage(
  name: string,
  linkedQuestionCount = 0,
): string {
  const impact =
    linkedQuestionCount > 0
      ? `${linkedQuestionCount} 条关联的面试题会保留，但会移到「未关联项目」。`
      : "引用它的面试题会保留但解除关联。";

  return `删除「${name}」后，${impact}确定删除？`;
}

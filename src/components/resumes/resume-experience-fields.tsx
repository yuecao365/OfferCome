"use client";

import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages, type Locale } from "@/lib/i18n/locale";
import {
  normalizeExperienceType,
  RESUME_EXPERIENCE_TYPE_LABELS_I18N,
} from "@/lib/resumes/confirmation";
import type { ResumeExperienceType } from "@/lib/resumes/extract";

const messages = defineMessages({
  "zh-CN": {
    type: "类型",
    typeAria: (label: string) => `${label} 类型`,
    name: "名称",
    nameAria: (label: string) => `${label} 名称`,
    internshipNamePlaceholder: "岗位或实习名称",
    projectNamePlaceholder: "项目名称",
    organization: "公司 / 组织",
    organizationAria: (label: string) => `${label} 公司或组织`,
    optional: "选填",
    description: "描述",
    descriptionAria: (label: string) => `${label} 描述`,
    descriptionPlaceholder: "选填，用于生成面试题的素材",
    deleteImpactLinked: (count: number) =>
      `${count} 条关联的面试题会保留，但会移到「未关联项目」。`,
    deleteImpactDefault: "引用它的面试题会保留但解除关联。",
    deleteConfirm: (name: string, impact: string) =>
      `删除「${name}」后，${impact}确定删除？`,
  },
  en: {
    type: "Type",
    typeAria: (label: string) => `${label} type`,
    name: "Name",
    nameAria: (label: string) => `${label} name`,
    internshipNamePlaceholder: "Role or internship title",
    projectNamePlaceholder: "Project name",
    organization: "Company / organization",
    organizationAria: (label: string) => `${label} company or organization`,
    optional: "Optional",
    description: "Description",
    descriptionAria: (label: string) => `${label} description`,
    descriptionPlaceholder: "Optional. Used as material for interview questions",
    deleteImpactLinked: (count: number) =>
      `${count} linked interview question${count === 1 ? "" : "s"} will be kept and moved to "Unlinked".`,
    deleteImpactDefault: "Interview questions that reference it will be kept but unlinked.",
    deleteConfirm: (name: string, impact: string) =>
      `Delete "${name}"? ${impact}`,
  },
});

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
  const t = useMessages(messages);
  const typeLabels = useMessages(RESUME_EXPERIENCE_TYPE_LABELS_I18N);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
        <FieldLabel>
          {t.type}
          <Select
            aria-label={t.typeAria(label)}
            disabled={disabled}
            onChange={(event) =>
              onChange({ type: normalizeExperienceType(event.target.value) })
            }
            value={value.type}
          >
            <option value="internship">{typeLabels.internship}</option>
            <option value="project">{typeLabels.project}</option>
          </Select>
        </FieldLabel>
        <FieldLabel>
          {t.name}
          <Input
            aria-label={t.nameAria(label)}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={
              value.type === "internship"
                ? t.internshipNamePlaceholder
                : t.projectNamePlaceholder
            }
            value={value.name}
          />
        </FieldLabel>
      </div>
      <FieldLabel>
        {t.organization}
        <Input
          aria-label={t.organizationAria(label)}
          disabled={disabled}
          onChange={(event) => onChange({ organization: event.target.value })}
          placeholder={t.optional}
          value={value.organization ?? ""}
        />
      </FieldLabel>
      <FieldLabel>
        {t.description}
        <Textarea
          aria-label={t.descriptionAria(label)}
          className="min-h-20 resize-y"
          disabled={disabled}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder={t.descriptionPlaceholder}
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
  locale: Locale = "zh-CN",
): string {
  const t = messages[locale];
  const impact =
    linkedQuestionCount > 0
      ? t.deleteImpactLinked(linkedQuestionCount)
      : t.deleteImpactDefault;

  return t.deleteConfirm(name, impact);
}

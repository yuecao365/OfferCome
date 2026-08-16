import { createHash } from "node:crypto";

import {
  isApplicationStage,
  MAX_JOB_DESCRIPTION_LENGTH,
  type ApplicationStage,
} from "./types";

export type ParsedApplicationForm =
  | {
      ok: true;
      value: {
        companyName: string;
        jobTitle: string;
        appliedAt: Date;
        stage: ApplicationStage;
        source: string;
        jobUrl: string | null;
        jobDescription: string | null;
        sourceKey: string;
        note: string | null;
      };
    }
  | { ok: false; message: string };

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseAppliedAt(value: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildManualSourceKey(input: {
  companyName: string;
  jobTitle: string;
  appliedAt: Date;
  jobUrl: string | null;
}): string {
  if (input.jobUrl) {
    return `manual:${input.jobUrl}`;
  }

  const hash = createHash("sha256")
    .update(
      [
        "manual",
        input.companyName.toLowerCase(),
        input.jobTitle.toLowerCase(),
        input.appliedAt.toISOString(),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);

  return `manual:${hash}`;
}

export function parseApplicationFormData(
  formData: FormData,
): ParsedApplicationForm {
  const companyName = formString(formData, "companyName");
  if (!companyName) {
    return { ok: false, message: "公司名称必填。" };
  }

  const jobTitle = formString(formData, "jobTitle");
  if (!jobTitle) {
    return { ok: false, message: "岗位名称必填。" };
  }

  const appliedAt = parseAppliedAt(formString(formData, "appliedAt"));
  if (!appliedAt) {
    return { ok: false, message: "投递时间必填。" };
  }

  const rawStage = formString(formData, "stage");
  if (!isApplicationStage(rawStage)) {
    return { ok: false, message: "当前流程状态必填。" };
  }

  const source = formString(formData, "source") || "manual";
  const jobUrl = formString(formData, "jobUrl") || null;

  const jobDescription = formString(formData, "jobDescription");
  if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message: `岗位描述不能超过 ${MAX_JOB_DESCRIPTION_LENGTH} 字符。`,
    };
  }

  return {
    ok: true,
    value: {
      companyName,
      jobTitle,
      appliedAt,
      stage: rawStage,
      source,
      jobUrl,
      jobDescription: jobDescription || null,
      sourceKey: buildManualSourceKey({
        companyName,
        jobTitle,
        appliedAt,
        jobUrl,
      }),
      note: formString(formData, "note") || null,
    },
  };
}

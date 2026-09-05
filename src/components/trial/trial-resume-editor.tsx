"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { ResumeExperienceConfirmationPanel } from "@/components/resumes/resume-experience-confirmation-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  buildPendingResumeExperienceConfirmations,
  toResumeExperienceConfirmationInput,
  type ExistingResumeProjectOption,
  type ResumeExperienceConfirmationInput,
} from "@/lib/resumes/confirmation";
import { parseResumeFile, parseResumeForm } from "@/lib/trial/client";
import { deleteStoredFile, putStoredFile } from "@/lib/trial/file-store";
import type { TrialResumeParseResult } from "@/lib/trial/resume";
import { TRIAL_RESUME_FILE_KEY } from "@/lib/trial/workspace-resume";
import type { TrialResumeMeta } from "@/lib/trial/workspace";

/**
 * 网页版的简历录入表单：上传文件或手动填写。
 * 文本解析在服务端做完即弃（服务器不存文件），原件另存进浏览器的
 * 文件仓库，供简历中心像本地版一样内嵌预览与下载。
 * 上传识别出的实习/项目先进与本地版相同的确认面板，再交给调用方保存。
 */

export type TrialResumeSaveInput = {
  text: string;
  items: ResumeExperienceConfirmationInput[];
  meta: Omit<TrialResumeMeta, "savedAt"> | null;
};

type ExperienceDraft = {
  name: string;
  type: "internship" | "project";
  organization: string;
  description: string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string }
  | {
      kind: "confirm";
      parsed: TrialResumeParseResult;
      file: File;
      meta: Omit<TrialResumeMeta, "savedAt">;
    };

const EMPTY_EXPERIENCE: ExperienceDraft = {
  name: "",
  type: "project",
  organization: "",
  description: "",
};

function fileMeta(file: File): Omit<TrialResumeMeta, "savedAt"> {
  return { fileName: file.name, fileSize: file.size, mimeType: file.type || null };
}

export function TrialResumeEditor({
  existingProjects,
  onSaved,
}: {
  existingProjects: ExistingResumeProjectOption[];
  onSaved: (input: TrialResumeSaveInput) => void;
}) {
  const [tab, setTab] = useState<"upload" | "form">("upload");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [summary, setSummary] = useState("");
  const [experiences, setExperiences] = useState<ExperienceDraft[]>([
    { ...EMPTY_EXPERIENCE },
  ]);

  // 原件留在浏览器里，简历中心才能像本地版那样直接预览；
  // 存不下（隐私模式、配额不足）就只保留解析文本。
  async function storeOriginal(file: File | null) {
    const stored = file ? await putStoredFile(TRIAL_RESUME_FILE_KEY, file) : false;
    if (!stored) await deleteStoredFile(TRIAL_RESUME_FILE_KEY);
  }

  async function handleUpload(file: File) {
    setPhase({ kind: "busy" });
    try {
      const parsed = await parseResumeFile(file);
      setPhase({ kind: "confirm", parsed, file, meta: fileMeta(file) });
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "简历处理失败。",
      });
    }
  }

  async function handleForm() {
    setPhase({ kind: "busy" });
    try {
      const parsed = await parseResumeForm({
        summary,
        experiences: experiences.filter(
          (item) => item.name.trim() || item.description.trim(),
        ),
      });
      await storeOriginal(null);
      // 手动填写的经历由用户亲手写成，不必再确认一遍。
      onSaved({
        text: parsed.text,
        items: buildPendingResumeExperienceConfirmations(parsed.experiences, []).map(
          toResumeExperienceConfirmationInput,
        ),
        meta: null,
      });
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "简历处理失败。",
      });
    }
  }

  function updateExperience(index: number, patch: Partial<ExperienceDraft>) {
    setExperiences((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  if (phase.kind === "confirm") {
    const { parsed, file, meta } = phase;
    return (
      <ResumeExperienceConfirmationPanel
        cancelNote="取消不会改动当前简历。"
        existingProjects={existingProjects}
        extractionSource={parsed.source === "manual" ? undefined : parsed.source}
        fileName={file.name}
        onCancel={() => setPhase({ kind: "idle" })}
        onConfirm={async (items) => {
          await storeOriginal(file);
          onSaved({ text: parsed.text, items, meta });
          return {
            status: "success",
            message: "简历已保存。",
            createdCount: items.length,
            linkedCount: 0,
          };
        }}
        pendingExperiences={buildPendingResumeExperienceConfirmations(
          parsed.experiences,
          existingProjects,
        )}
      />
    );
  }

  const busy = phase.kind === "busy";

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {(
          [
            ["upload", "上传简历（PDF/DOC/DOCX）"],
            ["form", "手动填写"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            onClick={() => setTab(value)}
            size="sm"
            variant={tab === value ? "primary" : "outline"}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "upload" ? (
        <FieldLabel>
          简历文件
          <Input
            accept=".pdf,.doc,.docx"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
            }}
            type="file"
          />
        </FieldLabel>
      ) : (
        <div className="grid gap-4">
          <FieldLabel>
            个人概述（方向、技术栈、亮点；至少 30 字）
            <Textarea
              onChange={(event) => setSummary(event.target.value)}
              placeholder="例如：三年后端开发经验，主技术栈 Go 与 MySQL，做过高并发订单系统……"
              rows={4}
              value={summary}
            />
          </FieldLabel>
          {experiences.map((experience, index) => (
            <div className="grid gap-3 rounded-lg border border-border p-4" key={index}>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <FieldLabel>
                  名称
                  <Input
                    onChange={(event) =>
                      updateExperience(index, { name: event.target.value })
                    }
                    placeholder="项目或实习名称"
                    value={experience.name}
                  />
                </FieldLabel>
                <FieldLabel>
                  类型
                  <Select
                    onChange={(event) =>
                      updateExperience(index, {
                        type: event.target.value as ExperienceDraft["type"],
                      })
                    }
                    value={experience.type}
                  >
                    <option value="project">项目</option>
                    <option value="internship">实习</option>
                  </Select>
                </FieldLabel>
                <FieldLabel>
                  组织（可选）
                  <Input
                    onChange={(event) =>
                      updateExperience(index, { organization: event.target.value })
                    }
                    placeholder="公司或学校"
                    value={experience.organization}
                  />
                </FieldLabel>
              </div>
              <FieldLabel>
                做了什么（职责、技术、结果；至少 20 字）
                <Textarea
                  onChange={(event) =>
                    updateExperience(index, { description: event.target.value })
                  }
                  rows={3}
                  value={experience.description}
                />
              </FieldLabel>
            </div>
          ))}
          <div className="flex items-center gap-3">
            {experiences.length < 3 ? (
              <Button
                onClick={() => setExperiences((c) => [...c, { ...EMPTY_EXPERIENCE }])}
                size="sm"
                variant="outline"
              >
                再加一段经历
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => void handleForm()}>
              {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              保存简历内容
            </Button>
          </div>
        </div>
      )}

      {busy && tab === "upload" ? <Alert tone="info">正在解析简历…</Alert> : null}
      {phase.kind === "error" ? <Alert tone="danger">{phase.message}</Alert> : null}
    </div>
  );
}

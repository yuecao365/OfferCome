"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";
import { parseResumeFile, parseResumeForm } from "@/lib/trial/client";
import type { TrialResumeInput } from "@/lib/trial/interview";
import type { TrialResumeMeta } from "@/lib/trial/workspace";

/**
 * 体验版的简历录入表单：上传文件（内存解析、不落盘）或手动填写。
 * /trial 准备页和简历中心的"上传简历"弹窗共用这一个组件。
 */

type RequestState = "idle" | "busy" | "done" | "error";

type ExperienceDraft = {
  name: string;
  type: "internship" | "project";
  organization: string;
  description: string;
};

const EMPTY_EXPERIENCE: ExperienceDraft = {
  name: "",
  type: "project",
  organization: "",
  description: "",
};

export function TrialResumeEditor({
  onSaved,
}: {
  onSaved: (
    resume: TrialResumeInput,
    meta: Omit<TrialResumeMeta, "savedAt"> | null,
  ) => void;
}) {
  const [tab, setTab] = useState<"upload" | "form">("upload");
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [experiences, setExperiences] = useState<ExperienceDraft[]>([
    { ...EMPTY_EXPERIENCE },
  ]);

  async function submit(
    request: Promise<TrialResumeInput>,
    meta: Omit<TrialResumeMeta, "savedAt"> | null,
  ) {
    setState("busy");
    setMessage("");
    try {
      const parsed = await request;
      setState("done");
      setMessage(
        parsed.projects.length > 0
          ? `已识别 ${parsed.projects.length} 段经历：${parsed.projects.map((p) => p.name).join("、")}`
          : "已读取简历内容（未识别到独立经历，将只用全文出题）。",
      );
      onSaved(parsed, meta);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "简历处理失败。");
    }
  }

  function updateExperience(index: number, patch: Partial<ExperienceDraft>) {
    setExperiences((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

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
            disabled={state === "busy"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void submit(parseResumeFile(file), {
                  fileName: file.name,
                  fileSize: file.size,
                  mimeType: file.type || null,
                });
              }
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
            <Button
              disabled={state === "busy"}
              onClick={() =>
                void submit(
                  parseResumeForm({
                    summary,
                    experiences: experiences.filter(
                      (item) => item.name.trim() || item.description.trim(),
                    ),
                  }),
                  null,
                )
              }
            >
              {state === "busy" ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              保存简历内容
            </Button>
          </div>
        </div>
      )}

      {state === "busy" && tab === "upload" ? (
        <Alert tone="info">正在解析简历文本…</Alert>
      ) : null}
      {state === "done" && message ? <Alert tone="success">{message}</Alert> : null}
      {state === "error" && message ? <Alert tone="danger">{message}</Alert> : null}
    </div>
  );
}

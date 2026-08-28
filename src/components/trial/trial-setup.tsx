"use client";

import { Check, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  MODEL_OPTIONS,
  PROVIDER_LABELS,
  TASK_PROVIDERS,
  getDefaultBaseURL,
  isCustomProvider,
  type AiProvider,
} from "@/lib/ai/config";
import { cn } from "@/lib/cn";
import type { TrialPresetJob } from "@/lib/trial/preset-jobs";

/**
 * 体验模式的三步准备：AI 服务 → 简历 → 岗位 → 开始。
 * 全部状态都在这一个组件里，完成即跳转到正式的模拟面试房间。
 */

type RequestState = "idle" | "busy" | "done" | "error";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "请求失败，请重试。");
  return data;
}

function StepBadge({ done, index }: { done: boolean; index: number }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        done ? "bg-success text-white" : "bg-accent text-accent-foreground",
      )}
    >
      {done ? <Check aria-hidden="true" className="size-4" /> : index}
    </span>
  );
}

function AiConfigSection({
  configured,
  onConfigured,
}: {
  configured: boolean;
  onConfigured: () => void;
}) {
  const [provider, setProvider] = useState<AiProvider>("deepseek");
  const [model, setModel] = useState("deepseek-chat");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<RequestState>(configured ? "done" : "idle");
  const [message, setMessage] = useState("");

  // Key cookie 只随 /api 请求发送，页面渲染看不到；
  // 是否已连接要问接口才知道（刷新后恢复"已连接"状态靠这里）。
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/trial/ai-config")
      .then((response) => response.json() as Promise<{ configured?: boolean }>)
      .then((data) => {
        if (!cancelled && data.configured) {
          setState("done");
          onConfigured();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const knownModels = MODEL_OPTIONS.text[provider] ?? [];
  const needsBaseURL = isCustomProvider(provider);

  function handleProviderChange(next: AiProvider) {
    setProvider(next);
    setModel(MODEL_OPTIONS.text[next]?.[0] ?? "");
    setState("idle");
  }

  async function handleSave() {
    setState("busy");
    setMessage("");
    try {
      await postJson("/api/trial/ai-config", {
        provider,
        model,
        baseURL: needsBaseURL ? baseURL : getDefaultBaseURL("text", provider),
        apiKey,
      });
      setState("done");
      onConfigured();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "保存失败。");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <StepBadge done={state === "done"} index={1} />
        <div>
          <CardTitle>连接你自己的模型服务</CardTitle>
          <CardDescription>
            Key 只保存在你的浏览器里、随请求临时使用，服务器不存储。面试花费约
            5–8 次模型调用。建议使用设置了额度上限的临时 Key，体验后可随时吊销。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldLabel>
            服务商
            <Select
              onChange={(event) => handleProviderChange(event.target.value as AiProvider)}
              value={provider}
            >
              {TASK_PROVIDERS.text.map((option) => (
                <option key={option} value={option}>
                  {PROVIDER_LABELS[option]}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            模型名称
            <Input
              list="trial-model-options"
              onChange={(event) => setModel(event.target.value)}
              placeholder="例如 deepseek-chat"
              value={model}
            />
            <datalist id="trial-model-options">
              {knownModels.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </FieldLabel>
        </div>
        {needsBaseURL ? (
          <FieldLabel>
            服务地址（Base URL）
            <Input
              onChange={(event) => setBaseURL(event.target.value)}
              placeholder="https://…/v1"
              value={baseURL}
            />
          </FieldLabel>
        ) : null}
        <FieldLabel>
          API Key
          <Input
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="填写对应服务商的 API Key"
            type="password"
            value={apiKey}
          />
        </FieldLabel>
        <div className="flex items-center gap-3">
          <Button disabled={state === "busy" || !model || !apiKey} onClick={() => void handleSave()}>
            {state === "busy" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {state === "busy" ? "正在测试连接…" : "测试并保存"}
          </Button>
          {state === "done" ? <Badge tone="success">已连接</Badge> : null}
        </div>
        {state === "error" && message ? <Alert tone="danger">{message}</Alert> : null}
      </CardContent>
    </Card>
  );
}

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

function ResumeSection({
  onReady,
  resumeName,
}: {
  onReady: (resumeId: string, name: string) => void;
  resumeName: string | null;
}) {
  const [tab, setTab] = useState<"upload" | "form">("upload");
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [experiences, setExperiences] = useState<ExperienceDraft[]>([
    { ...EMPTY_EXPERIENCE },
  ]);

  async function submit(request: Promise<Response>) {
    setState("busy");
    setMessage("");
    try {
      const response = await request;
      const data = (await response.json()) as {
        resumeId?: string;
        originalName?: string;
        projects?: { name: string }[];
        error?: string;
      };
      if (!response.ok || !data.resumeId) {
        throw new Error(data.error ?? "简历处理失败。");
      }
      setState("done");
      setMessage(
        data.projects?.length
          ? `已识别 ${data.projects.length} 段经历：${data.projects.map((item) => item.name).join("、")}`
          : "已保存简历内容。",
      );
      onReady(data.resumeId, data.originalName ?? "已提交的简历");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "简历处理失败。");
    }
  }

  function handleUpload(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    void submit(fetch("/api/trial/resume", { method: "POST", body: formData }));
  }

  function handleFormSubmit() {
    void submit(
      fetch("/api/trial/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          experiences: experiences.filter(
            (item) => item.name.trim() || item.description.trim(),
          ),
        }),
      }),
    );
  }

  function updateExperience(index: number, patch: Partial<ExperienceDraft>) {
    setExperiences((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <StepBadge done={Boolean(resumeName)} index={2} />
        <div>
          <CardTitle>提供简历内容</CardTitle>
          <CardDescription>
            上传后只保留解析出的文本，不保存文件；也可以手动填写。内容仅用于本场出题。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
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
              onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
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
                      onChange={(event) => updateExperience(index, { name: event.target.value })}
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
              <Button disabled={state === "busy"} onClick={handleFormSubmit}>
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
      </CardContent>
    </Card>
  );
}

function JobSection({
  presetJobs,
  selection,
  onSelect,
}: {
  presetJobs: TrialPresetJob[];
  selection: TrialJobSelection | null;
  onSelect: (next: TrialJobSelection) => void;
}) {
  const [customCompany, setCustomCompany] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customJd, setCustomJd] = useState("");

  const customReady =
    customCompany.trim() && customTitle.trim() && customJd.trim().length >= 40;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <StepBadge done={Boolean(selection)} index={3} />
        <div>
          <CardTitle>选择目标岗位</CardTitle>
          <CardDescription>选一个预置岗位直接开始，或粘贴你正在投的岗位描述。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {presetJobs.map((job) => {
            const active = selection?.kind === "preset" && selection.job.id === job.id;
            return (
              <button
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  active
                    ? "border-brand bg-accent/60"
                    : "border-border bg-surface hover:border-brand/40",
                )}
                key={job.id}
                onClick={() => onSelect({ kind: "preset", job })}
                type="button"
              >
                <p className="text-sm font-semibold text-foreground">{job.jobTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{job.companyName}</p>
              </button>
            );
          })}
        </div>
        <details open={selection?.kind === "custom"}>
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
            使用自己的岗位描述
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldLabel>
                公司名称
                <Input
                  onChange={(event) => setCustomCompany(event.target.value)}
                  value={customCompany}
                />
              </FieldLabel>
              <FieldLabel>
                岗位名称
                <Input
                  onChange={(event) => setCustomTitle(event.target.value)}
                  value={customTitle}
                />
              </FieldLabel>
            </div>
            <FieldLabel>
              岗位描述（JD）
              <Textarea
                onChange={(event) => setCustomJd(event.target.value)}
                placeholder="粘贴完整的岗位职责与任职要求"
                rows={6}
                value={customJd}
              />
            </FieldLabel>
            <div>
              <Button
                disabled={!customReady}
                onClick={() =>
                  onSelect({
                    kind: "custom",
                    companyName: customCompany.trim(),
                    jobTitle: customTitle.trim(),
                    jobDescription: customJd.trim(),
                  })
                }
                size="sm"
                variant="outline"
              >
                使用这个岗位
              </Button>
            </div>
          </div>
        </details>
        {selection ? (
          <Alert tone="success">
            已选择：
            {selection.kind === "preset"
              ? `${selection.job.companyName} · ${selection.job.jobTitle}`
              : `${selection.companyName} · ${selection.jobTitle}`}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

type TrialJobSelection =
  | { kind: "preset"; job: TrialPresetJob }
  | {
      kind: "custom";
      companyName: string;
      jobTitle: string;
      jobDescription: string;
    };

export function TrialSetup({ presetJobs }: { presetJobs: TrialPresetJob[] }) {
  const router = useRouter();
  const [aiReady, setAiReady] = useState(false);
  const [resume, setResume] = useState<{ id: string; name: string } | null>(null);
  const [job, setJob] = useState<TrialJobSelection | null>(null);
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");

  const ready = aiReady && resume && job;

  async function handleStart() {
    if (!resume || !job) return;
    setState("busy");
    setMessage("");
    const selected =
      job.kind === "preset"
        ? job.job
        : { companyName: job.companyName, jobTitle: job.jobTitle, jobDescription: job.jobDescription };

    const formData = new FormData();
    formData.append("companyName", selected.companyName);
    formData.append("jobTitle", selected.jobTitle);
    formData.append("jobDescriptionText", selected.jobDescription);
    formData.append("resumeId", resume.id);
    formData.append("questionCount", "3");
    formData.append("interactionMode", "text");
    formData.append("difficulty", "standard");
    formData.append("followUpsEnabled", "on");

    try {
      const response = await fetch("/api/interviews/mock", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { href?: string; error?: string };
      if (!response.ok || !data.href) throw new Error(data.error ?? "创建面试失败。");
      router.push(data.href);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "创建面试失败。");
    }
  }

  return (
    <div className="grid gap-4">
      <AiConfigSection configured={aiReady} onConfigured={() => setAiReady(true)} />
      <ResumeSection
        onReady={(id, name) => setResume({ id, name })}
        resumeName={resume?.name ?? null}
      />
      <JobSection onSelect={setJob} presetJobs={presetJobs} selection={job} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            准备好后开始一场 3 题速览版：AI 按岗位与你的简历出题，作答后逐题评分并生成报告。
          </p>
          <Button disabled={!ready || state === "busy"} onClick={() => void handleStart()}>
            {state === "busy" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" />
            )}
            {state === "busy" ? "正在创建面试…" : "开始模拟面试"}
          </Button>
        </CardContent>
      </Card>
      {state === "error" && message ? <Alert tone="danger">{message}</Alert> : null}
    </div>
  );
}

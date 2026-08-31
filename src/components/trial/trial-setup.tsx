"use client";

import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldLabel, Input, Select } from "@/components/ui/form-controls";
import {
  MODEL_OPTIONS,
  PROVIDER_LABELS,
  TASK_PROVIDERS,
  getDefaultBaseURL,
  isCustomProvider,
  type AiProvider,
} from "@/lib/ai/config";
import { cn } from "@/lib/cn";
import { writeAiToken } from "@/lib/trial/browser-store";
import { connectAiConfig } from "@/lib/trial/client";
import type { TrialResumeInput } from "@/lib/trial/interview";

import { TrialResumeEditor } from "./trial-resume-editor";

/** 体验版的两步准备：连接模型 → 提供简历。岗位在模拟面试页选择。 */

type RequestState = "idle" | "busy" | "done" | "error";

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

function AiSection({ ready }: { ready: boolean }) {
  const [provider, setProvider] = useState<AiProvider>("deepseek");
  const [model, setModel] = useState("deepseek-chat");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");

  const needsBaseURL = isCustomProvider(provider);
  const done = ready || state === "done";

  async function handleConnect() {
    setState("busy");
    setMessage("");
    try {
      const result = await connectAiConfig({
        provider,
        model,
        baseURL: needsBaseURL ? baseURL : getDefaultBaseURL("text", provider),
        apiKey,
      });
      writeAiToken(result.token);
      setState("done");
      setApiKey("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "连接失败。");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <StepBadge done={done} index={1} />
        <div>
          <CardTitle>连接你自己的模型服务</CardTitle>
          <CardDescription>
            Key 只保存在当前浏览器标签页，随请求临时使用，服务器不存储。一场面试约
            5–8 次模型调用。建议用设了额度上限的临时 Key，体验后可随时吊销。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldLabel>
            服务商
            <Select
              onChange={(event) => {
                const next = event.target.value as AiProvider;
                setProvider(next);
                setModel(MODEL_OPTIONS.text[next]?.[0] ?? "");
                setState("idle");
              }}
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
              list="trial-models"
              onChange={(event) => setModel(event.target.value)}
              placeholder="例如 deepseek-chat"
              value={model}
            />
            <datalist id="trial-models">
              {(MODEL_OPTIONS.text[provider] ?? []).map((option) => (
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
            placeholder={done ? "已连接，如需更换请重新填写" : "填写对应服务商的 API Key"}
            type="password"
            value={apiKey}
          />
        </FieldLabel>
        <div className="flex items-center gap-3">
          <Button
            disabled={state === "busy" || !model || !apiKey}
            onClick={() => void handleConnect()}
          >
            {state === "busy" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {state === "busy" ? "正在测试连接…" : "测试并连接"}
          </Button>
          {done ? <Badge tone="success">已连接</Badge> : null}
        </div>
        {state === "error" && message ? <Alert tone="danger">{message}</Alert> : null}
      </CardContent>
    </Card>
  );
}

function ResumeSection({
  resume,
  onReady,
}: {
  resume: TrialResumeInput | null;
  onReady: ComponentProps<typeof TrialResumeEditor>["onSaved"];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <StepBadge done={Boolean(resume)} index={2} />
        <div>
          <CardTitle>提供简历内容</CardTitle>
          <CardDescription>
            上传的文件只在内存里解析一次，服务器不保存文件；也可以直接手动填写。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <TrialResumeEditor onSaved={onReady} />
      </CardContent>
    </Card>
  );
}

export function TrialSetup({
  aiReady,
  resume,
  onResumeReady,
}: {
  aiReady: boolean;
  resume: TrialResumeInput | null;
  onResumeReady: ComponentProps<typeof TrialResumeEditor>["onSaved"];
}) {
  const ready = aiReady && resume !== null;

  return (
    <div className="grid gap-4">
      <AiSection ready={aiReady} />
      <ResumeSection onReady={onResumeReady} resume={resume} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {ready
              ? "准备完成。去模拟面试页选择目标岗位，AI 按岗位和你的简历出题，作答后逐题评分并生成报告。"
              : "完成上面两步后，就可以在真实工作台里体验 AI 模拟面试、投递管理、面试复盘等功能。"}
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/interviews/mock">
              <Sparkles aria-hidden="true" className="size-4" />
              开始 AI 模拟面试
            </ButtonLink>
            <ButtonLink href="/" variant="outline">
              打开工作台
              <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

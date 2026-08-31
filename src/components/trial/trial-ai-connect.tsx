"use client";

import { Loader2, Unplug } from "lucide-react";
import { useState, type ReactNode } from "react";

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
import { FieldLabel, Input, Select } from "@/components/ui/form-controls";
import {
  MODEL_OPTIONS,
  PROVIDER_LABELS,
  TASK_PROVIDERS,
  getDefaultBaseURL,
  isCustomProvider,
  type AiProvider,
} from "@/lib/ai/config";
import { writeAiToken } from "@/lib/trial/browser-store";
import { connectAiConfig } from "@/lib/trial/client";

/**
 * 体验版的模型连接卡：Key 经服务端校验换成临时令牌后只存在
 * sessionStorage。/trial 准备页和设置页共用这一个组件。
 */
export function TrialAiConnect({
  ready,
  stepBadge,
}: {
  ready: boolean;
  /** 准备页在此渲染步骤序号徽章。 */
  stepBadge?: (done: boolean) => ReactNode;
}) {
  const [provider, setProvider] = useState<AiProvider>("deepseek");
  const [model, setModel] = useState("deepseek-chat");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
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

  function handleDisconnect() {
    writeAiToken(null);
    setState("idle");
    setMessage("");
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        {stepBadge?.(done)}
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
        <div className="flex flex-wrap items-center gap-3">
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
          {done ? (
            <Button onClick={handleDisconnect} size="sm" variant="outline">
              <Unplug aria-hidden="true" className="size-3.5" />
              断开连接
            </Button>
          ) : null}
        </div>
        {state === "error" && message ? <Alert tone="danger">{message}</Alert> : null}
      </CardContent>
    </Card>
  );
}

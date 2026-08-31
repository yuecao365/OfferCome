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
import {
  setRememberAiConnection,
  trialRememberDocument,
  writeAiToken,
} from "@/lib/trial/browser-store";
import { connectAiConfig } from "@/lib/trial/client";
import { useStoredDocument } from "@/lib/trial/stored-document";

const OTHER_MODEL_VALUE = "__other_model__";
const DEFAULT_PROVIDER: AiProvider = "deepseek";

/**
 * 网页版的模型连接卡：Key 经服务端连通性校验后编码成连接串交给浏览器保存，
 * 服务端不存储；每次请求随请求头带上，用完即弃。
 * 保存位置由"记住连接"决定（localStorage / sessionStorage）。
 */

export function TrialAiConnect({
  ready,
  stepBadge,
}: {
  ready: boolean;
  /** 准备页在此渲染步骤序号徽章。 */
  stepBadge?: (done: boolean) => ReactNode;
}) {
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_PROVIDER);
  // 默认选中该服务商的第一个预设，不要写死型号——预设更新了这里会跟着走。
  const [model, setModel] = useState(MODEL_OPTIONS.text[DEFAULT_PROVIDER]?.[0] ?? "");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  // 未设置过（含 SSR 首帧）按默认"记住"渲染。
  const remember = useStoredDocument(trialRememberDocument) ?? true;

  const needsBaseURL = isCustomProvider(provider);
  const done = ready || state === "done";
  const modelOptions = MODEL_OPTIONS.text[provider] ?? [];
  const usesPresetModel = modelOptions.includes(model);

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
      setRememberAiConnection(remember);
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
            Key 只保存在你自己的浏览器，随请求临时使用，服务器不存储。一场面试约
            5–8 次模型调用。建议用设了额度上限的临时 Key，用完可随时吊销。
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
            {modelOptions.length > 0 ? (
              <>
                <Select
                  onChange={(event) =>
                    setModel(
                      event.target.value === OTHER_MODEL_VALUE
                        ? ""
                        : event.target.value,
                    )
                  }
                  value={usesPresetModel ? model : OTHER_MODEL_VALUE}
                >
                  {modelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value={OTHER_MODEL_VALUE}>其他（手动输入）</option>
                </Select>
                {usesPresetModel ? null : (
                  <Input
                    aria-label="其他模型名称"
                    className="mt-2 font-normal"
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="输入服务商控制台中的模型 ID"
                    value={model}
                  />
                )}
              </>
            ) : (
              <Input
                onChange={(event) => setModel(event.target.value)}
                placeholder="输入服务商控制台中的模型 ID"
                value={model}
              />
            )}
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
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-subtle px-4 py-3">
          <input
            checked={remember}
            className="mt-0.5 size-4 accent-[var(--color-brand)]"
            onChange={(event) => setRememberAiConnection(event.target.checked)}
            type="checkbox"
          />
          <span className="text-sm">
            <span className="font-semibold text-foreground">
              在这台设备上记住连接
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {remember
                ? "关闭网页后无需重新连接。Key 会保存在本浏览器，公用电脑请关掉这一项。"
                : "只在当前标签页有效，关闭后需要重新连接。"}
            </span>
          </span>
        </label>
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

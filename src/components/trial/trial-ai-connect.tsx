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
  PROVIDER_LABELS_I18N,
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
import { useLocale } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { connectAiConfig } from "@/lib/trial/client";
import { useStoredDocument } from "@/lib/trial/stored-document";

const messages = defineMessages({
  "zh-CN": {
    connectFailed: "连接失败。",
    title: "连接你自己的模型服务",
    description: "Key 只保存在你自己的浏览器，随请求临时使用，服务器不存储。一场面试约 5–8 次模型调用。建议用设了额度上限的临时 Key，用完可随时吊销。",
    provider: "服务商",
    modelName: "模型名称",
    otherModel: "其他（手动输入）",
    otherModelName: "其他模型名称",
    modelIdPlaceholder: "输入服务商控制台中的模型 ID",
    baseUrl: "服务地址（Base URL）",
    connectedPlaceholder: "已连接，如需更换请重新填写",
    keyPlaceholder: "填写对应服务商的 API Key",
    remember: "在这台设备上记住连接",
    rememberOn: "关闭网页后无需重新连接。Key 会保存在本浏览器，公用电脑请关掉这一项。",
    rememberOff: "只在当前标签页有效，关闭后需要重新连接。",
    testing: "正在测试连接…",
    connect: "测试并连接",
    connected: "已连接",
    disconnect: "断开连接",
  },
  en: {
    connectFailed: "Connection failed.",
    title: "Connect your own model service",
    description: "Your key stays in your own browser and is only used for each request; the server never stores it. One interview takes about 5–8 model calls. Use a temporary key with a spending cap that you can revoke any time.",
    provider: "Provider",
    modelName: "Model",
    otherModel: "Other (enter manually)",
    otherModelName: "Other model name",
    modelIdPlaceholder: "Enter the model ID from the provider's console",
    baseUrl: "Base URL",
    connectedPlaceholder: "Connected. Enter a new key to replace it",
    keyPlaceholder: "Enter the API key for this provider",
    remember: "Remember this connection on this device",
    rememberOn: "No need to reconnect after closing the page. The key is saved in this browser; turn this off on shared computers.",
    rememberOff: "Only valid in this tab; you'll need to reconnect after closing it.",
    testing: "Testing connection…",
    connect: "Test and connect",
    connected: "Connected",
    disconnect: "Disconnect",
  },
});

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
  const locale = useLocale();
  const t = messages[locale];

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
      setMessage(error instanceof Error ? error.message : t.connectFailed);
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
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>
            {t.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldLabel>
            {t.provider}
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
                  {PROVIDER_LABELS_I18N[locale][option]}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            {t.modelName}
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
                  <option value={OTHER_MODEL_VALUE}>{t.otherModel}</option>
                </Select>
                {usesPresetModel ? null : (
                  <Input
                    aria-label={t.otherModelName}
                    className="mt-2 font-normal"
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={t.modelIdPlaceholder}
                    value={model}
                  />
                )}
              </>
            ) : (
              <Input
                onChange={(event) => setModel(event.target.value)}
                placeholder={t.modelIdPlaceholder}
                value={model}
              />
            )}
          </FieldLabel>
        </div>
        {needsBaseURL ? (
          <FieldLabel>
            {t.baseUrl}
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
            placeholder={done ? t.connectedPlaceholder : t.keyPlaceholder}
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
              {t.remember}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {remember ? t.rememberOn : t.rememberOff}
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
            {state === "busy" ? t.testing : t.connect}
          </Button>
          {done ? <Badge tone="success">{t.connected}</Badge> : null}
          {done ? (
            <Button onClick={handleDisconnect} size="sm" variant="outline">
              <Unplug aria-hidden="true" className="size-3.5" />
              {t.disconnect}
            </Button>
          ) : null}
        </div>
        {state === "error" && message ? <Alert tone="danger">{message}</Alert> : null}
      </CardContent>
    </Card>
  );
}

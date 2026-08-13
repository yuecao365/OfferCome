"use client";

import { useState } from "react";

import {
  getDefaultBaseURL,
  isCustomProvider,
  MODEL_OPTIONS,
  PROVIDER_LABELS,
  TASK_PROVIDERS,
  type AiProvider,
  type PublicAiTaskConfig,
} from "@/lib/ai/config";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { ApiKeyField } from "./api-key-field";

type ApiResult = PublicAiTaskConfig & { error?: string; message?: string };

const TASK_CONTENT = {
  transcription: {
    title: "语音转文本",
    description: "用于将面试录音转换成文字。自定义服务必须兼容 OpenAI 音频转写接口。",
  },
  text: {
    title: "文本理解",
    description: "用于从面试文本中识别问题、回答和关联项目，并为后续简历 AI 解析复用。",
  },
} as const;

const OTHER_MODEL_VALUE = "__other_model__";

export function AiTaskSettingsCard({ initial }: { initial: PublicAiTaskConfig }) {
  const [config, setConfig] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const content = TASK_CONTENT[config.task];
  const modelOptions = MODEL_OPTIONS[config.task][config.provider] ?? [];
  const hasPresetModel = modelOptions.includes(config.model);
  const isCustom = isCustomProvider(config.provider);
  const providerId = `${config.task}-provider`;
  const modelId = `${config.task}-model`;
  const baseUrlId = `${config.task}-base-url`;

  function updateProvider(provider: AiProvider) {
    const nextModels = MODEL_OPTIONS[config.task][provider] ?? [];
    setConfig((current) => ({
      ...current,
      provider,
      model: nextModels[0] ?? "",
      baseURL: getDefaultBaseURL(config.task, provider),
      requiresApiKey: provider !== "local",
      apiKeyConfigured: provider === current.provider && current.apiKeyConfigured,
      maskedKey: provider === current.provider ? current.maskedKey : null,
    }));
    setApiKey("");
    setClearApiKey(false);
    setMessage("");
  }

  function requestBody() {
    return {
      task: config.task,
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL,
      requiresApiKey: config.requiresApiKey,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(clearApiKey ? { apiKey: null } : {}),
    };
  }

  async function run(action: "save" | "test") {
    setPendingAction(action);
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch(
        action === "save" ? "/api/settings/ai" : "/api/settings/ai/test",
        {
          method: action === "save" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody()),
        },
      );
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error ?? "操作失败，请稍后重试。");

      if (action === "save") {
        setConfig(result);
        setApiKey("");
        setIsVisible(false);
        setClearApiKey(false);
        setMessage("模型设置已保存。");
      } else {
        setMessage(result.message ?? "连接成功，模型配置可用。");
      }
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="border-b border-border pb-4">
        <h2 className="font-semibold text-foreground">{content.title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{content.description}</p>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground" htmlFor={providerId}>
          模型服务商
          <select
            className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-ring/25"
            id={providerId}
            onChange={(event) => updateProvider(event.target.value as AiProvider)}
            value={config.provider}
          >
            {TASK_PROVIDERS[config.task].map((provider) => (
              <option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>
            ))}
          </select>
        </label>

        <div className="block text-sm font-medium text-foreground">
          <label htmlFor={modelId}>模型名称</label>
          {modelOptions.length > 0 ? (
            <>
              <select
                className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-ring/25"
                id={modelId}
                onChange={(event) => setConfig((current) => ({
                  ...current,
                  model: event.target.value === OTHER_MODEL_VALUE
                    ? ""
                    : event.target.value,
                }))}
                value={hasPresetModel ? config.model : OTHER_MODEL_VALUE}
              >
                {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                <option value={OTHER_MODEL_VALUE}>其他（手动输入）</option>
              </select>
              {!hasPresetModel ? (
                <input
                  aria-label="其他模型名称"
                  className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25"
                  onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
                  placeholder="输入服务商控制台中的模型 ID"
                  value={config.model}
                />
              ) : null}
            </>
          ) : (
            <input
              className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25"
              id={modelId}
              onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
              placeholder={config.task === "transcription" ? "例如 whisper-1" : "例如 llama3.2"}
              value={config.model}
            />
          )}
        </div>
      </div>

      {isCustom ? (
        <div className="mt-5 grid gap-4">
          <label className="block text-sm font-medium text-foreground" htmlFor={baseUrlId}>
            服务地址
            <input
              className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25"
              id={baseUrlId}
              onChange={(event) => setConfig((current) => ({ ...current, baseURL: event.target.value }))}
              placeholder="http://localhost:11434/v1"
              type="url"
              value={config.baseURL ?? ""}
            />
          </label>
          {config.provider === "compatible" ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                checked={config.requiresApiKey}
                onChange={(event) => setConfig((current) => ({ ...current, requiresApiKey: event.target.checked }))}
                type="checkbox"
              />
              此服务需要 API Key
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">本地模型默认不需要 API Key。</p>
          )}
        </div>
      ) : null}

      <div className="mt-5">
        <ApiKeyField
          clearing={clearApiKey}
          configured={config.apiKeyConfigured}
          id={`${config.task}-api-key`}
          maskedKey={config.maskedKey}
          onChange={(value) => { setApiKey(value); if (value) setClearApiKey(false); }}
          onToggleClear={() => { setClearApiKey((value) => !value); setApiKey(""); }}
          onToggleVisibility={() => setIsVisible((value) => !value)}
          required={config.requiresApiKey}
          value={apiKey}
          visible={isVisible}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          disabled={pendingAction !== null}
          onClick={() => run("save")}
          type="button"
        >
          {pendingAction === "save" ? "保存中..." : "保存"}
        </Button>
        <Button
          disabled={pendingAction !== null}
          onClick={() => run("test")}
          type="button"
          variant="outline"
        >
          {pendingAction === "test" ? "测试中..." : "测试连接"}
        </Button>
        {message ? (
          <Alert aria-live="polite" className="w-full sm:w-auto" tone={isError ? "danger" : "success"}>
            {message}
          </Alert>
        ) : null}
      </div>
    </section>
  );
}

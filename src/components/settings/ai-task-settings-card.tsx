"use client";

import { useState } from "react";

import {
  getDefaultBaseURL,
  isCustomProvider,
  MODEL_OPTIONS,
  PROVIDER_LABELS_I18N,
  TASK_PROVIDERS,
  type AiProvider,
  type PublicAiTaskConfig,
} from "@/lib/ai/config";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

import { ApiKeyField } from "./api-key-field";

type ApiResult = PublicAiTaskConfig & { error?: string; message?: string };

const messages = defineMessages({
  "zh-CN": {
    tasks: {
      transcription: {
        title: "语音转文本",
        description: "用于将面试录音转换成文字。自定义服务必须兼容 OpenAI 音频转写接口。",
      },
      text: {
        title: "文本理解",
        description: "用于面试官、备课、报告等所有文本 agent，以及简历与面试记录的解析。",
      },
      scoring: {
        title: "面试评分",
        description: "只用于模拟面试结束后的逐段评分。评分模型与面试官分开，可以选更稳的模型；不配时用文本模型或已存的 OpenAI Key 跑 gpt-5.4-mini。",
      },
    },
    failed: "操作失败，请稍后重试。",
    saved: "模型设置已保存。",
    connected: "连接成功，模型配置可用。",
    provider: "模型服务商",
    modelName: "模型名称",
    otherModel: "其他（手动输入）",
    otherModelName: "其他模型名称",
    modelIdPlaceholder: "输入服务商控制台中的模型 ID",
    transcriptionExample: "例如 whisper-1",
    textExample: "例如 llama3.2",
    baseUrl: "服务地址",
    requiresKey: "此服务需要 API Key",
    localNoKey: "本地模型默认不需要 API Key。",
    saving: "保存中...",
    save: "保存",
    testing: "测试中...",
    test: "测试连接",
  },
  en: {
    tasks: {
      transcription: {
        title: "Speech to text",
        description: "Turns interview recordings into text. A custom service must be compatible with the OpenAI audio transcription API.",
      },
      text: {
        title: "Text understanding",
        description: "Used by every text agent (interviewer, prep, reports) and for parsing resumes and interview notes.",
      },
      scoring: {
        title: "Interview scoring",
        description: "Only used for per-segment scoring after a mock interview. It is separate from the interviewer, so you can pick a steadier model; if unset, the text model or a saved OpenAI key runs gpt-5.4-mini.",
      },
    },
    failed: "Something went wrong. Please try again later.",
    saved: "Model settings saved.",
    connected: "Connected. This model configuration works.",
    provider: "Provider",
    modelName: "Model",
    otherModel: "Other (enter manually)",
    otherModelName: "Other model name",
    modelIdPlaceholder: "Enter the model ID from the provider's console",
    transcriptionExample: "e.g. whisper-1",
    textExample: "e.g. llama3.2",
    baseUrl: "Base URL",
    requiresKey: "This service needs an API key",
    localNoKey: "Local models don't need an API key by default.",
    saving: "Saving...",
    save: "Save",
    testing: "Testing...",
    test: "Test connection",
  },
});

const OTHER_MODEL_VALUE = "__other_model__";

export function AiTaskSettingsCard({ initial }: { initial: PublicAiTaskConfig }) {
  const [config, setConfig] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const locale = useLocale();
  const t = messages[locale];
  const content = t.tasks[config.task];
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
      if (!response.ok) throw new Error(result.error ?? t.failed);

      if (action === "save") {
        setConfig(result);
        setApiKey("");
        setIsVisible(false);
        setClearApiKey(false);
        setMessage(t.saved);
      } else {
        setMessage(result.message ?? t.connected);
      }
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : t.failed);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="rounded-panel border border-border bg-surface p-5 shadow-card">
      <div className="border-b border-border pb-4">
        <h2 className="font-semibold text-foreground">{content.title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{content.description}</p>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground" htmlFor={providerId}>
          {t.provider}
          <select
            className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-ring/25"
            id={providerId}
            onChange={(event) => updateProvider(event.target.value as AiProvider)}
            value={config.provider}
          >
            {TASK_PROVIDERS[config.task].map((provider) => (
              <option key={provider} value={provider}>{PROVIDER_LABELS_I18N[locale][provider]}</option>
            ))}
          </select>
        </label>

        <div className="block text-sm font-medium text-foreground">
          <label htmlFor={modelId}>{t.modelName}</label>
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
                <option value={OTHER_MODEL_VALUE}>{t.otherModel}</option>
              </select>
              {!hasPresetModel ? (
                <input
                  aria-label={t.otherModelName}
                  className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25"
                  onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
                  placeholder={t.modelIdPlaceholder}
                  value={config.model}
                />
              ) : null}
            </>
          ) : (
            <input
              className="mt-2 block h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25"
              id={modelId}
              onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
              placeholder={config.task === "transcription" ? t.transcriptionExample : t.textExample}
              value={config.model}
            />
          )}
        </div>
      </div>

      {isCustom ? (
        <div className="mt-5 grid gap-4">
          <label className="block text-sm font-medium text-foreground" htmlFor={baseUrlId}>
            {t.baseUrl}
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
              {t.requiresKey}
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">{t.localNoKey}</p>
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
          {pendingAction === "save" ? t.saving : t.save}
        </Button>
        <Button
          disabled={pendingAction !== null}
          onClick={() => run("test")}
          type="button"
          variant="outline"
        >
          {pendingAction === "test" ? t.testing : t.test}
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

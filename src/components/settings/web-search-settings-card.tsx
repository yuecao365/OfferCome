"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import type { PublicWebSearchConfig } from "@/lib/settings/web-search";

import { ApiKeyField } from "./api-key-field";

export function WebSearchSettingsCard({ initial }: { initial: PublicWebSearchConfig }) {
  const [config, setConfig] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function save() {
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/settings/web-search", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(clearApiKey ? { apiKey: null } : {}),
        }),
      });
      const result = (await response.json()) as PublicWebSearchConfig & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存搜索设置失败。");
      setConfig(result);
      setApiKey("");
      setClearApiKey(false);
      setVisible(false);
      setMessage("搜索设置已保存。");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "保存搜索设置失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-panel border border-border bg-surface p-5 shadow-card">
      <div className="border-b border-border pb-4">
        <h2 className="font-semibold text-foreground">公开岗位信息检索</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          可选配置。岗位描述不足时，可检索公开岗位信息辅助补全；未配置时仍会使用文本模型的通用知识。
        </p>
      </div>
      <label className="mt-5 block text-sm font-medium text-foreground">
        搜索服务
        <Select
          className="mt-2"
          onChange={(event) => setConfig((current) => ({
            ...current,
            provider: event.target.value as "none" | "tavily",
          }))}
          value={config.provider}
        >
          <option value="none">不使用联网搜索</option>
          <option value="tavily">Tavily</option>
        </Select>
      </label>
      {config.provider === "tavily" ? (
        <div className="mt-5">
          <ApiKeyField
            clearing={clearApiKey}
            configured={config.apiKeyConfigured}
            id="web-search-api-key"
            maskedKey={config.maskedKey}
            onChange={(value) => { setApiKey(value); if (value) setClearApiKey(false); }}
            onToggleClear={() => { setClearApiKey((value) => !value); setApiKey(""); }}
            onToggleVisibility={() => setVisible((value) => !value)}
            required
            value={apiKey}
            visible={visible}
          />
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={save} type="button">
          {pending ? "保存中..." : "保存"}
        </Button>
        {message ? <Alert tone={failed ? "danger" : "success"}>{message}</Alert> : null}
      </div>
    </section>
  );
}

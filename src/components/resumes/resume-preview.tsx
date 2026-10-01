"use client";

import { Download, FileWarning, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { ResumePreviewKind } from "@/lib/resumes/types";

const messages = defineMessages({
  "zh-CN": {
    download: "下载文件",
    noInlinePreview: "当前文件格式不支持浏览器内嵌预览。请下载后使用本机 Word、WPS 或其他文档工具查看。",
    failedTitle: "简历预览加载失败",
    failedHint: "可以重新加载，或直接下载原文件查看。",
    reload: "重新加载",
    loading: "正在加载简历预览",
    previewOf: (name: string) => `${name} 预览`,
  },
  en: {
    download: "Download file",
    noInlinePreview: "This file format can't be previewed in the browser. Download it and open it in Word, WPS or another document app.",
    failedTitle: "Couldn't load the resume preview",
    failedHint: "Reload, or download the original file to view it.",
    reload: "Reload",
    loading: "Loading resume preview",
    previewOf: (name: string) => `Preview of ${name}`,
  },
});

type ResumePreviewProps = {
  name: string;
  typeLabel: string;
  sizeLabel: string;
  downloadUrl: string;
  previewUrl: string;
  previewKind: ResumePreviewKind;
};

export function ResumePreview(props: ResumePreviewProps) {
  const t = useMessages(messages);
  const [loading, setLoading] = useState(props.previewKind !== "none");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setAttempt((value) => value + 1);
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{props.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {props.typeLabel} · {props.sizeLabel}
          </p>
        </div>
        <a className={buttonClassName({ variant: "outline", size: "sm" })} href={props.downloadUrl}>
          <Download aria-hidden="true" className="size-4" />
          {t.download}
        </a>
      </div>

      {props.previewKind === "none" ? (
        <div className="p-5">
          <Alert tone="info">
            {t.noInlinePreview}
          </Alert>
        </div>
      ) : failed ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
          <FileWarning aria-hidden="true" className="size-8 text-danger" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">{t.failedTitle}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t.failedHint}</p>
          <Button className="mt-4" onClick={retry} size="sm" variant="outline">
            <RotateCcw aria-hidden="true" className="size-4" />
            {t.reload}
          </Button>
        </div>
      ) : (
        <div className="relative min-h-[60vh] bg-surface-subtle lg:min-h-[72vh]">
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-subtle" role="status">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                {t.loading}
              </div>
            </div>
          ) : null}
          {props.previewKind === "pdf" ? (
            <iframe
              className="h-[72vh] w-full bg-surface"
              key={attempt}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
              onLoad={() => setLoading(false)}
              src={props.previewUrl}
              title={t.previewOf(props.name)}
            />
          ) : (
            <div className="flex h-[72vh] items-start justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={t.previewOf(props.name)}
                className="max-h-full max-w-full object-contain shadow-card"
                key={attempt}
                onError={() => {
                  setLoading(false);
                  setFailed(true);
                }}
                onLoad={() => setLoading(false)}
                src={props.previewUrl}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

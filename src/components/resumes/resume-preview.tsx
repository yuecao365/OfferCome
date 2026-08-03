"use client";

import { Download, FileWarning, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ResumePreviewKind } from "@/lib/resumes/types";

type ResumePreviewProps = {
  name: string;
  typeLabel: string;
  sizeLabel: string;
  downloadUrl: string;
  previewUrl: string;
  previewKind: ResumePreviewKind;
};

export function ResumePreview(props: ResumePreviewProps) {
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
          下载文件
        </a>
      </div>

      {props.previewKind === "none" ? (
        <div className="p-5">
          <Alert tone="info">
            当前文件格式不支持浏览器内嵌预览。请下载后使用本机 Word、WPS 或其他文档工具查看。
          </Alert>
        </div>
      ) : failed ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
          <FileWarning aria-hidden="true" className="size-8 text-danger" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">简历预览加载失败</h3>
          <p className="mt-2 text-sm text-muted-foreground">可以重新加载，或直接下载原文件查看。</p>
          <Button className="mt-4" onClick={retry} size="sm" variant="outline">
            <RotateCcw aria-hidden="true" className="size-4" />
            重新加载
          </Button>
        </div>
      ) : (
        <div className="relative min-h-[60vh] bg-surface-subtle lg:min-h-[72vh]">
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-subtle" role="status">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                正在加载简历预览
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
              title={`${props.name} 预览`}
            />
          ) : (
            <div className="flex h-[72vh] items-start justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`${props.name} 预览`}
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

"use client";

import { useRef, useState, type ChangeEvent, type InputHTMLAttributes, type Ref } from "react";

import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": { choose: "选择文件", none: "未选择文件" },
  en: { choose: "Choose file", none: "No file chosen" },
});

/**
 * 文件选择：原生 `<input type="file">` 的按钮与"未选择文件"由浏览器按系统语言画，切到英文界面仍是中文。
 * 这里把原生控件藏起来（仍参与表单提交与 required 校验），按钮和文件名用界面语言自己画。
 */
export function FileInput({
  className,
  onChange,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { ref?: Ref<HTMLInputElement> }) {
  const t = useMessages(messages);
  const inner = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    inner.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setFileName(files && files.length > 0 ? Array.from(files).map((file) => file.name).join(", ") : null);
    onChange?.(event);
  };

  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <input {...props} className="sr-only" onChange={handleChange} ref={setRefs} type="file" />
      <button
        className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-hover disabled:opacity-50"
        disabled={props.disabled}
        onClick={() => inner.current?.click()}
        type="button"
      >
        {t.choose}
      </button>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{fileName ?? t.none}</span>
    </span>
  );
}

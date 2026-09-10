"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { highlightSegments, quotedFragments, type InterviewMaterials } from "@/lib/mock-interviews/materials";

/**
 * 资料抽屉：房间顶栏"资料"打开，右侧盖住聊天区，显示本场的简历原文与岗位描述（会话快照）。
 * 面试官对质时引用的简历原句高亮，最新一句滚到可见处。不影响面试进程，也不进评分。
 */

function Section({ title, text, fragments }: { title: string; text: string; fragments: string[] }) {
  const segments = useMemo(() => highlightSegments(text, fragments), [text, fragments]);
  const latest = fragments.at(-1) ?? null;
  const latestRef = useRef<HTMLElement>(null);
  useEffect(() => {
    latestRef.current?.scrollIntoView({ block: "center" });
  }, [latest]);
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
        {text.trim() ? (
          segments.map((segment, index) =>
            segment.hit ? (
              <mark
                className="rounded-sm bg-warning-soft px-0.5 text-foreground"
                key={index}
                ref={segment.text === latest ? latestRef : undefined}
              >
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )
        ) : (
          <span className="text-muted-foreground">（无）</span>
        )}
      </p>
    </section>
  );
}

export function MockInterviewMaterialsDrawer({
  materials,
  messages,
  open,
  onClose,
}: {
  materials: InterviewMaterials;
  messages: { role: string; content: string }[];
  open: boolean;
  onClose: () => void;
}) {
  const resumeQuotes = useMemo(() => quotedFragments(messages, materials.resumeText), [messages, materials.resumeText]);
  const jdQuotes = useMemo(() => quotedFragments(messages, materials.jobDescription), [messages, materials.jobDescription]);
  if (!open) return null;
  return (
    <aside
      aria-label="本场资料"
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-lg"
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <p className="min-w-0 flex-1 text-sm font-medium">本场资料</p>
        {resumeQuotes.length > 0 ? (
          <p className="text-xs text-muted-foreground">面试官引用了简历 {resumeQuotes.length} 处，已高亮</p>
        ) : null}
        <Button aria-label="关闭资料" onClick={onClose} size="sm" type="button" variant="ghost">
          <X aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-4 py-4">
        <Section fragments={resumeQuotes} text={materials.resumeText} title="简历原文" />
        <Section fragments={jdQuotes} text={materials.jobDescription} title="岗位描述" />
      </div>
    </aside>
  );
}

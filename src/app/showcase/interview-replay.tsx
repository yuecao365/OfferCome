"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import type { ReplayScript } from "./replay-data";

/**
 * 首屏演示：一场真实模拟面试的节选，按回合回放。面试官的话逐字打出，下面一行小字是它当时写下的理由；
 * 候选人的话整段出现。放完停几秒再从头来；悬停或聚焦暂停；reduced-motion 直接全部显示。
 * 窗口用宣传页自己的深色调（sc-window），不套产品的暗色主题。换语言时由父组件用 key 重挂，回放从头开始。
 */

const CHAR_MS = 22;
const CANDIDATE_DELAY_MS = 700;
const AFTER_LINE_MS = 900;
const LOOP_PAUSE_MS = 5200;

export function InterviewReplay({ script, label, whyLabel, note }: { script: ReplayScript; label: string; whyLabel: string; note: string }) {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(0); // 已完整显示的行数
  const [typed, setTyped] = useState(0); // 当前行已打出的字数
  const [paused, setPaused] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const total = script.lines.length;

  useEffect(() => {
    if (reducedMotion || paused) return;
    if (shown >= total) {
      const timer = window.setTimeout(() => {
        setShown(0);
        setTyped(0);
      }, LOOP_PAUSE_MS);
      return () => window.clearTimeout(timer);
    }
    const line = script.lines[shown];
    if (line.role === "candidate") {
      const timer = window.setTimeout(() => setShown((value) => value + 1), CANDIDATE_DELAY_MS + Math.min(1800, line.text.length * 8));
      return () => window.clearTimeout(timer);
    }
    if (typed < line.text.length) {
      const timer = window.setTimeout(() => setTyped((value) => value + 1), CHAR_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setShown((value) => value + 1);
      setTyped(0);
    }, AFTER_LINE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, reducedMotion, script, shown, total, typed]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [shown, typed]);

  const visible = reducedMotion ? total : shown;
  const current = !reducedMotion && shown < total ? script.lines[shown] : null;

  return (
    <div
      aria-label={label}
      className="sc-rise [animation-delay:200ms]"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="sc-window overflow-hidden rounded-panel border shadow-overlay">
        <div className="flex items-center justify-between border-b px-4 py-2.5 font-mono text-xs" style={{ borderColor: "var(--sc-line)", color: "var(--sc-dim)" }}>
          <span className="truncate">{script.title}</span>
          <span className="shrink-0 tabular-nums">{script.progress}</span>
        </div>
        <div aria-live="polite" className="grid h-[420px] gap-3 overflow-y-auto p-4 sm:h-[460px] sm:p-5" ref={scroller}>
          {script.lines.slice(0, visible).map((line, index) => (
            <Bubble key={index} line={line} typed={null} whyLabel={whyLabel} />
          ))}
          {current ? <Bubble line={current} typed={current.role === "interviewer" ? typed : 0} whyLabel={whyLabel} /> : null}
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">{note}</p>
    </div>
  );
}

function Bubble({ line, typed, whyLabel }: { line: ReplayScript["lines"][number]; typed: number | null; whyLabel: string }) {
  if (line.role === "candidate") {
    if (typed === 0) return null; // 候选人那行等它的停顿到了再整段出现
    return (
      <div className="flex justify-end">
        <p className="sc-rise-soft-in max-w-[86%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] leading-6" style={{ background: "var(--sc-you)", color: "var(--sc-paper)" }}>
          {line.text}
        </p>
      </div>
    );
  }
  const typing = typed !== null && typed < line.text.length;
  const text = typed === null ? line.text : line.text.slice(0, typed);
  return (
    <div className="flex justify-start">
      <div className="max-w-[86%]">
        <p className="mb-1 font-mono text-[11px]" style={{ color: "var(--sc-dim)" }}>
          {line.move}
        </p>
        <p className="rounded-2xl rounded-tl-sm border px-4 py-2.5 text-[13px] leading-6" style={{ borderColor: "var(--sc-line)", color: "var(--sc-paper)" }}>
          {text}
          {typing ? <span className="sc-caret ml-0.5 inline-block h-3 w-px translate-y-0.5" style={{ background: "var(--sc-paper)" }} /> : null}
        </p>
        <p className={cn("mt-1.5 pl-1 text-[12px] leading-5 transition-opacity duration-500", typing ? "opacity-0" : "opacity-100")} style={{ color: "var(--sc-dim)" }}>
          <span className="mr-1.5 font-mono text-[11px]" style={{ color: "var(--sc-mint)" }}>
            {whyLabel}
          </span>
          {line.why}
        </p>
      </div>
    </div>
  );
}

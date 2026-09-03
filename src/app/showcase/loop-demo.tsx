"use client";

import { CornerDownRight } from "lucide-react";
import { useEffect, useState, type CSSProperties, type PointerEvent } from "react";

import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import type { ShowcaseCopy } from "./copy";

const SCENE_MS = 5200;

type DemoProps = {
  copy: ShowcaseCopy["demo"];
  scenes: ShowcaseCopy["scenes"];
  label: string;
};

/** 阶段徽章：与产品一致的灰底圆点，Offer 才有浅色填充。 */
function StageBadge({ label, tone }: { label: string; tone: "neutral" | "brand" | "success" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-control border border-border bg-surface px-1.5 text-xs text-foreground transition-colors duration-300",
        tone === "success" && "border-success/25 bg-success-soft text-success-strong",
      )}
    >
      <span
        className={cn(
          "size-1 rounded-full",
          tone === "neutral" ? "bg-muted-foreground" : tone === "brand" ? "bg-brand" : "bg-success",
        )}
      />
      {label}
    </span>
  );
}

function SceneApply({ copy, active }: { copy: ShowcaseCopy["demo"]; active: boolean }) {
  return (
    <div className="relative p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="h-6 w-28 rounded-control border border-border-strong bg-surface" />
        <span className="font-mono text-xs text-muted-foreground">12 / 16</span>
      </div>
      <ul className="divide-y divide-border rounded-control border border-border">
        <li className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
          <span>{copy.tableHead[0]}</span>
          <span>{copy.tableHead[1]}</span>
        </li>
        {copy.tableRows.map(([company, title, stage], index) => (
          <li
            className={cn("flex items-center justify-between gap-3 px-3 py-2 sc-row", active && "sc-row-in")}
            key={company}
            style={{ animationDelay: `${200 + index * 140}ms` }}
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">{company}</span>
              <span className="block truncate text-xs text-muted-foreground">{title}</span>
            </span>
            <StageBadge
              label={stage}
              tone={stage === "Offer" ? "success" : index === 0 ? "brand" : "neutral"}
            />
          </li>
        ))}
      </ul>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{copy.tableFooter}</p>
      <div
        className={cn(
          "absolute right-4 top-3 inline-flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-foreground shadow-raised sc-toast",
          active && "sc-toast-in",
        )}
      >
        <span className="size-1.5 rounded-full bg-brand" />
        {copy.syncToast}
      </div>
    </div>
  );
}

function SceneInterview({ copy, active }: { copy: ShowcaseCopy["demo"]; active: boolean }) {
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-foreground">3 / 8</span>
        <div className="grid flex-1 grid-cols-8 gap-1">
          {Array.from({ length: 8 }, (_, index) => (
            <span
              className={cn(
                "h-1 rounded-full",
                index < 2 ? "bg-brand" : index === 2 ? "bg-accent-strong ring-1 ring-inset ring-brand" : "bg-muted",
              )}
              key={index}
            />
          ))}
        </div>
      </div>
      <div className="border-l-2 border-brand pl-3">
        <p className={cn("text-[15px] font-medium leading-5 text-foreground sc-type", active && "sc-type-in")}>
          {copy.question}
        </p>
        <p
          className={cn(
            "mt-2 flex items-start gap-1 text-xs leading-4 text-muted-foreground sc-rise-soft",
            active && "sc-rise-soft-in",
          )}
          style={{ animationDelay: "1600ms" }}
        >
          <CornerDownRight aria-hidden="true" className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          {copy.followUp}
        </p>
      </div>
      <div
        className={cn("mt-4 rounded-control border border-border bg-surface-subtle p-3 sc-rise-soft", active && "sc-rise-soft-in")}
        style={{ animationDelay: "2400ms" }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">{copy.scoreLabel}</span>
          <span className="text-lg font-medium tabular-nums text-foreground">
            84<span className="ml-0.5 text-xs font-normal text-muted-foreground">/ 100</span>
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full bg-brand sc-bar", active && "sc-bar-in")}
            style={{ width: "84%", animationDelay: "2700ms" }}
          />
        </div>
      </div>
      <div
        className={cn("mt-3 rounded-control border border-border-strong bg-surface-sunken px-3 py-2.5 text-xs leading-4 text-muted-foreground sc-rise-soft", active && "sc-rise-soft-in")}
        style={{ animationDelay: "600ms" }}
      >
        {copy.answerPlaceholder}
        <span className="sc-caret ml-0.5 inline-block h-3 w-px translate-y-0.5 bg-foreground" />
      </div>
      <div
        className={cn("mt-3 flex items-center gap-2 sc-rise-soft", active && "sc-rise-soft-in")}
        style={{ animationDelay: "800ms" }}
      >
        <span className="rounded-control bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground">
          {copy.answerActions[0]}
        </span>
        <span className="rounded-control px-2 py-1 text-xs text-muted-foreground">{copy.answerActions[1]}</span>
      </div>
    </div>
  );
}

function SceneReview({ copy, active }: { copy: ShowcaseCopy["demo"]; active: boolean }) {
  const total = copy.reviewRows.reduce((sum, [, count]) => sum + count, 0);
  return (
    <div className="p-5">
      <div className="mb-3 inline-flex items-center gap-0.5 rounded-control bg-surface-sunken p-0.5">
        {copy.reviewSources.map((source, index) => (
          <span
            className={cn(
              "rounded-[4px] px-2 py-1 text-xs",
              index === 0 ? "bg-surface font-medium text-foreground shadow-card" : "text-muted-foreground",
            )}
            key={source}
          >
            {source}
          </span>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
      <div className="pr-4 sm:border-r sm:border-border">
        <p className="text-xs text-muted-foreground">{copy.reviewTotal}</p>
        <p className="mt-1 text-5xl font-medium tabular-nums leading-none text-foreground">
          <CountUp active={active} value={total} />
        </p>
        <dl className="mt-4 grid gap-1.5">
          {copy.reviewGroups.map(([group, count], index) => (
            <div
              className={cn("flex items-center justify-between gap-4 text-xs sc-row", active && "sc-row-in")}
              key={group}
              style={{ animationDelay: `${900 + index * 120}ms` }}
            >
              <dt className="text-muted-foreground">{group}</dt>
              <dd className="font-mono tabular-nums text-foreground">{count}</dd>
            </div>
          ))}
        </dl>
      </div>
      <ul className="grid content-start gap-1.5">
        {copy.reviewRows.map(([question, count], index) => (
          <li
            className={cn(
              "flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2 sc-row",
              active && "sc-row-in",
            )}
            key={question}
            style={{ animationDelay: `${300 + index * 160}ms` }}
          >
            <span className="truncate text-[13px] text-foreground">{question}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">× {count}</span>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}

const graphLayout = [
  { x: 120, y: 60, r: 9 },
  { x: 60, y: 120, r: 6 },
  { x: 190, y: 40, r: 5 },
  { x: 200, y: 118, r: 6 },
  { x: 130, y: 150, r: 5 },
] as const;

const graphEdges = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 4],
  [3, 4],
] as const;

function SceneProfile({ copy, active }: { copy: ShowcaseCopy["demo"]; active: boolean }) {
  return (
    <div className="dot-grid grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
      <svg aria-hidden="true" className="h-64 w-full" viewBox="0 0 260 180">
        {graphEdges.map(([from, to], index) => (
          <line
            className={cn("sc-edge", active && "sc-edge-in")}
            key={`${from}-${to}`}
            pathLength={1}
            stroke="var(--border-strong)"
            strokeWidth={1.2}
            style={{ animationDelay: `${300 + index * 120}ms` }}
            x1={graphLayout[from].x}
            x2={graphLayout[to].x}
            y1={graphLayout[from].y}
            y2={graphLayout[to].y}
          />
        ))}
        {graphLayout.map((node, index) => (
          <g
            className={cn("sc-node", active && "sc-node-in")}
            key={copy.graphNodes[index]}
            style={{ animationDelay: `${200 + index * 140}ms`, transformOrigin: `${node.x}px ${node.y}px` }}
          >
            {index === 0 ? (
              <circle cx={node.x} cy={node.y} fill="none" r={node.r + 7} stroke="var(--brand)" strokeOpacity={0.35} />
            ) : null}
            <circle
              cx={node.x}
              cy={node.y}
              fill={index === 0 ? "var(--brand)" : "var(--surface)"}
              r={node.r}
              stroke={index === 0 ? "var(--brand)" : "var(--border-strong)"}
              strokeWidth={1.2}
            />
            <text
              fill={index === 0 ? "var(--foreground)" : "var(--muted-foreground)"}
              fontSize={10}
              fontWeight={index === 0 ? 600 : 400}
              textAnchor="middle"
              x={node.x}
              y={node.y + node.r + 13}
            >
              {copy.graphNodes[index]}
            </text>
          </g>
        ))}
      </svg>
      <div
        className={cn("rounded-control border border-border bg-surface-subtle px-3 py-2 sc-rise-soft", active && "sc-rise-soft-in")}
        style={{ animationDelay: "1300ms" }}
      >
        <p className="text-xs text-muted-foreground">{copy.insightKind}</p>
        <p className="mt-0.5 max-w-44 text-[13px] leading-4 text-foreground">{copy.insight}</p>
        <div className="mt-2.5 flex gap-1.5">
          <span className="rounded-control bg-brand px-2 py-1 text-xs font-medium text-brand-foreground">
            {copy.insightActions[0]}
          </span>
          <span className="rounded-control px-2 py-1 text-xs text-muted-foreground">{copy.insightActions[1]}</span>
        </div>
      </div>
    </div>
  );
}

function CountUp({ value, active }: { value: number; active: boolean }) {
  const [display, setDisplay] = useState(active ? value : 0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 900);
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, value]);
  return <>{display}</>;
}

/**
 * 主视觉：一个自动播放、可点击的四幕闭环演示。用真实产品组件的样式现场渲染，
 * 不放截图。悬停或聚焦时暂停；reduced-motion 时不自动播放，直接显示画像一幕。
 */
export function LoopDemo({ copy, scenes, label }: DemoProps) {
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState<CSSProperties>();
  // reduced-motion 时不自动播放，固定停在画像一幕（信息最完整）
  const scene = reducedMotion ? 3 : playing;

  useEffect(() => {
    if (reducedMotion || paused) return;
    const timer = window.setTimeout(() => setPlaying((current) => (current + 1) % scenes.length), SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, reducedMotion, playing, scenes.length]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ transform: `perspective(1200px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)` });
  };

  const panels = [SceneApply, SceneInterview, SceneReview, SceneProfile] as const;

  return (
    <div
      className="sc-rise [animation-delay:200ms]"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => {
        setPaused(false);
        setTilt(undefined);
      }}
      onPointerMove={handlePointerMove}
    >
      {/* 窗框内切到产品的暗色 token：浅色页面里嵌一块真实的深色产品界面 */}
      <div
        className="overflow-hidden rounded-panel border border-border-strong bg-background text-foreground shadow-overlay transition-transform duration-300 ease-app"
        data-theme="dark"
        style={tilt}
      >
        <div className="flex items-center gap-1.5 border-b border-border bg-surface-subtle px-3.5 py-2.5">
          <span className="size-2 rounded-full bg-border-strong" />
          <span className="size-2 rounded-full bg-border-strong" />
          <span className="size-2 rounded-full bg-border-strong" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {copy.address} / {scenes[scene].label}
          </span>
        </div>
        <div className="relative min-h-[380px] bg-surface" aria-live="polite">
          {panels.map((Panel, index) => {
            const active = index === scene;
            return (
              <div
                aria-hidden={!active}
                className={cn(
                  "absolute inset-0 transition-[opacity,transform] duration-500 ease-app",
                  active ? "opacity-100" : "pointer-events-none opacity-0 translate-y-2",
                )}
                key={scenes[index].label}
              >
                {active ? <Panel active copy={copy} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div aria-label={label} className="flex items-center gap-1" role="tablist">
          {scenes.map((item, index) => {
            const active = index === scene;
            return (
              <button
                aria-selected={active}
                className={cn(
                  "group relative flex-1 rounded-control px-2 py-1.5 text-left text-[13px] transition-colors duration-150 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                key={item.label}
                onClick={() => setPlaying(index)}
                role="tab"
                type="button"
              >
                <span className="block font-medium">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">0{index + 1}</span>
                  {item.label}
                </span>
                <span className="mt-1.5 block h-0.5 overflow-hidden rounded-full bg-border">
                  <span
                    className={cn(
                      "block h-full origin-left bg-brand",
                      active && !paused && !reducedMotion ? "sc-progress" : active ? "scale-x-100" : "scale-x-0",
                    )}
                    key={`${index}-${active}`}
                    style={{ animationDuration: `${SCENE_MS}ms` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 min-h-5 text-[13px] text-muted-foreground">{scenes[scene].caption}</p>
      </div>
    </div>
  );
}

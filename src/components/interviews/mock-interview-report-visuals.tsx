"use client";

import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";

import { useReducedMotion } from "@/lib/use-reduced-motion";

type QuestionDimension = {
  name: string;
  score: number;
  evidence: string;
};

export function InterviewScoreRing({ score }: { score: number }) {
  const reducedMotion = useReducedMotion();
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 800);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, score]);

  const displayScore = reducedMotion ? score : animatedScore;

  return (
    <div
      aria-label={`面试总分 ${score} 分，共 100 分`}
      className="relative mx-auto size-32"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <RadialBarChart
          data={[{ score }]}
          endAngle={-270}
          innerRadius="76%"
          outerRadius="100%"
          startAngle={90}
        >
          <PolarRadiusAxis
            axisLine={false}
            domain={[0, 100]}
            tick={false}
          />
          <RadialBar
            animationDuration={800}
            background={{ fill: "var(--muted)" }}
            cornerRadius={999}
            dataKey="score"
            fill="var(--brand)"
            isAnimationActive={!reducedMotion}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-3xl font-semibold tracking-tight text-foreground">
          {displayScore}
        </strong>
        <span className="text-xs text-muted-foreground">满分 100</span>
      </div>
    </div>
  );
}

export function QuestionDimensionScores({
  dimensions,
}: {
  dimensions: QuestionDimension[];
}) {
  const reducedMotion = useReducedMotion();

  if (dimensions.length >= 3) {
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
        <div
          aria-label={dimensions
            .map((dimension) => `${dimension.name} ${Math.round(dimension.score)} 分`)
            .join("，")}
          className="h-64 rounded-xl border border-border bg-surface-subtle p-2"
          role="img"
        >
          <ResponsiveContainer height="100%" width="100%">
            <RadarChart data={dimensions} outerRadius="68%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="name"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <PolarRadiusAxis
                axisLine={false}
                domain={[0, 100]}
                tick={false}
              />
              <Radar
                animationDuration={600}
                dataKey="score"
                fill="var(--brand)"
                fillOpacity={0.2}
                isAnimationActive={!reducedMotion}
                stroke="var(--brand)"
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <DimensionEvidenceList dimensions={dimensions} />
      </div>
    );
  }

  return <DimensionBars dimensions={dimensions} />;
}

function DimensionBars({ dimensions }: { dimensions: QuestionDimension[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {dimensions.map((dimension) => (
        <div className="rounded-lg border border-border p-3" key={dimension.name}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">{dimension.name}</span>
            <span className="font-semibold text-foreground">
              {Math.round(dimension.score)} 分
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max(0, Math.min(100, dimension.score))}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {dimension.evidence}
          </p>
        </div>
      ))}
    </div>
  );
}

function DimensionEvidenceList({ dimensions }: { dimensions: QuestionDimension[] }) {
  return (
    <div className="grid content-start gap-2">
      {dimensions.map((dimension) => (
        <div className="rounded-lg border border-border bg-surface p-3" key={dimension.name}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <strong className="text-foreground">{dimension.name}</strong>
            <span className="font-semibold text-brand">
              {Math.round(dimension.score)} 分
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {dimension.evidence}
          </p>
        </div>
      ))}
    </div>
  );
}

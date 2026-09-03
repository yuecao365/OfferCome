type QuestionDimension = {
  name: string;
  score: number;
  evidence: string;
};

/** 每题的维度得分：横向条 + 证据文本；不用雷达图，读数更直接。 */
export function QuestionDimensionScores({
  dimensions,
}: {
  dimensions: QuestionDimension[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {dimensions.map((dimension) => {
        const score = Math.max(0, Math.min(100, Math.round(dimension.score)));
        return (
          <div className="rounded-control border border-border p-3" key={dimension.name}>
            <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
              <span className="font-medium text-foreground">{dimension.name}</span>
              <span className="font-mono text-xs tabular-nums text-foreground">{score}</span>
            </div>
            <div
              aria-label={`${dimension.name} ${score} 分`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={score}
              className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500 ease-app"
                style={{ width: `${score}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{dimension.evidence}</p>
          </div>
        );
      })}
    </div>
  );
}

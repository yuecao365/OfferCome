/** 判分结果与汇总；判分器随对话式面试官重写，见 docs/eval-plan.md。 */
export type GraderVerdict = {
  grader: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  value?: number;
};

export function summarizeVerdicts(verdicts: GraderVerdict[]) {
  return {
    pass: verdicts.every((verdict) => verdict.status !== "fail"),
    failed: verdicts.filter((v) => v.status === "fail").map((v) => v.grader),
    skipped: verdicts.filter((v) => v.status === "skip").map((v) => v.grader),
  };
}

/**
 * 评测结果的聚合与报告渲染。纯函数：运行器只负责跑，数字都在这里算。
 */

export type CaseRunResult = {
  caseId: string;
  direction: string;
  resume: string;
  rep: number;
  runId: string;
  /** 链路抛错时的信息；有错即视为本次不通过。 */
  error: string | null;
  promptVersion: string | null;
  model: string | null;
  totalTokens: number;
  durationMs: number;
  verdicts: GraderVerdict[];
};

export type GraderTally = { pass: number; fail: number; skip: number };

export type CaseSummary = {
  caseId: string;
  direction: string;
  resume: string;
  reps: Array<{
    rep: number;
    runId: string;
    pass: boolean;
    failed: string[];
    error: string | null;
  }>;
  /** 每次都通过：pass^k 的分子。 */
  allRepsPass: boolean;
};

export type EvalReport = {
  id: string;
  createdAt: string;
  tag: string;
  k: number;
  promptVersion: string | null;
  model: string | null;
  graders: Record<string, GraderTally>;
  cases: CaseSummary[];
  summary: {
    caseCount: number;
    runCount: number;
    errorCount: number;
    /** 单次运行全部判分器通过的比例。 */
    runPassRate: number;
    /** 用例在 k 次里全部通过的比例。 */
    passK: number;
    tokensTotal: number;
    tokensMean: number;
    msP50: number;
    msP95: number;
  };
};

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function runPasses(result: CaseRunResult): boolean {
  return result.error === null && summarizeVerdicts(result.verdicts).pass;
}

export function aggregateEvalResults(input: {
  id: string;
  tag: string;
  k: number;
  createdAt?: Date;
  results: CaseRunResult[];
}): EvalReport {
  const graders: Record<string, GraderTally> = {};
  for (const result of input.results) {
    for (const verdict of result.verdicts) {
      const tally = graders[verdict.grader] ?? { pass: 0, fail: 0, skip: 0 };
      tally[verdict.status] += 1;
      graders[verdict.grader] = tally;
    }
  }

  const byCase = new Map<string, CaseRunResult[]>();
  for (const result of input.results) {
    byCase.set(result.caseId, [...(byCase.get(result.caseId) ?? []), result]);
  }
  const cases: CaseSummary[] = [...byCase.entries()].map(([caseId, results]) => {
    const reps = results
      .toSorted((a, b) => a.rep - b.rep)
      .map((result) => ({
        rep: result.rep,
        runId: result.runId,
        pass: runPasses(result),
        failed: summarizeVerdicts(result.verdicts).failed,
        error: result.error,
      }));
    return {
      caseId,
      direction: results[0].direction,
      resume: results[0].resume,
      reps,
      allRepsPass: reps.length > 0 && reps.every((rep) => rep.pass),
    };
  });

  const runCount = input.results.length;
  const passedRuns = input.results.filter(runPasses).length;
  const tokens = input.results.map((result) => result.totalTokens);
  const durations = input.results.map((result) => result.durationMs);
  const first = input.results.find((result) => result.promptVersion) ?? input.results[0];

  return {
    id: input.id,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    tag: input.tag,
    k: input.k,
    promptVersion: first?.promptVersion ?? null,
    model: first?.model ?? null,
    graders,
    cases,
    summary: {
      caseCount: cases.length,
      runCount,
      errorCount: input.results.filter((result) => result.error !== null).length,
      runPassRate: runCount ? passedRuns / runCount : 0,
      passK: cases.length ? cases.filter((item) => item.allRepsPass).length / cases.length : 0,
      tokensTotal: tokens.reduce((sum, value) => sum + value, 0),
      tokensMean: runCount ? tokens.reduce((sum, value) => sum + value, 0) / runCount : 0,
      msP50: percentile(durations, 50),
      msP95: percentile(durations, 95),
    },
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function delta(current: number, baseline: number | undefined): string {
  if (baseline === undefined) return "";
  const diff = (current - baseline) * 100;
  if (Math.abs(diff) < 0.5) return " (±0)";
  return ` (${diff > 0 ? "+" : ""}${diff.toFixed(0)} pt)`;
}

function graderPassRate(tally: GraderTally | undefined): number | undefined {
  if (!tally) return undefined;
  const judged = tally.pass + tally.fail;
  return judged ? tally.pass / judged : undefined;
}

export function renderEvalMarkdown(report: EvalReport, baseline?: EvalReport | null): string {
  const lines: string[] = [];
  lines.push(`# 出题评测报告 ${report.tag}`);
  lines.push("");
  lines.push(
    `- 时间：${report.createdAt}\n- 提示词版本：${report.promptVersion ?? "-"}\n- 模型：${report.model ?? "-"}\n- 用例 ${report.summary.caseCount} 组 × k=${report.k}，共 ${report.summary.runCount} 次运行，链路报错 ${report.summary.errorCount} 次` +
      (baseline ? `\n- 基线：${baseline.tag}（${baseline.promptVersion ?? "-"}，${baseline.model ?? "-"}）` : ""),
  );
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push("| 指标 | 本次 |");
  lines.push("|---|---|");
  lines.push(`| 单次通过率 | ${pct(report.summary.runPassRate)}${delta(report.summary.runPassRate, baseline?.summary.runPassRate)} |`);
  lines.push(`| pass^${report.k} | ${pct(report.summary.passK)}${delta(report.summary.passK, baseline?.summary.passK)} |`);
  lines.push(`| 平均 token / 次 | ${Math.round(report.summary.tokensMean)} |`);
  lines.push(`| 耗时 p50 / p95 | ${Math.round(report.summary.msP50)} ms / ${Math.round(report.summary.msP95)} ms |`);
  lines.push("");
  lines.push("## 判分器");
  lines.push("");
  lines.push("| 判分器 | 通过 | 失败 | 跳过 | 通过率 |");
  lines.push("|---|---|---|---|---|");
  for (const [name, tally] of Object.entries(report.graders)) {
    const rate = graderPassRate(tally);
    lines.push(
      `| ${name} | ${tally.pass} | ${tally.fail} | ${tally.skip} | ${rate === undefined ? "-" : pct(rate) + delta(rate, graderPassRate(baseline?.graders[name]))} |`,
    );
  }
  lines.push("");
  lines.push("## 用例");
  lines.push("");
  lines.push("| 用例 | 方向 | 简历 | 各次 | 失败的判分器 |");
  lines.push("|---|---|---|---|---|");
  for (const item of report.cases) {
    const marks = item.reps.map((rep) => (rep.pass ? "✓" : rep.error ? "!" : "✗")).join("");
    const failed = [...new Set(item.reps.flatMap((rep) => (rep.error ? [`error: ${rep.error.slice(0, 60)}`] : rep.failed)))].join(", ");
    lines.push(`| ${item.caseId} | ${item.direction} | ${item.resume} | ${marks} | ${failed || "-"} |`);
  }
  lines.push("");
  return lines.join("\n");
}

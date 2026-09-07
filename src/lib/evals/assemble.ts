import type { GenerationQuestion, GenerationRecord } from "./types";

/** AgentRun 表里判分需要的列；prisma 行与测试里的手写行都满足这个形状。 */
export type AgentRunRow = {
  runId: string;
  agent: string;
  event: string;
  status: string;
  model?: string | null;
  promptVersion?: string | null;
  durationMs: number;
  totalTokens?: number | null;
  metricsJson: string | null;
  payloadJson: string | null;
  outputJson: string | null;
  createdAt: Date;
};

type Json = Record<string, unknown>;

function parseJson(value: string | null): Json {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Json)
      : {};
  } catch {
    return {};
  }
}

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isQuestion(value: unknown): value is GenerationQuestion {
  const item = asObject(value);
  return typeof item.question === "string" && typeof item.sourceKind === "string";
}

function questionsOf(value: unknown): GenerationQuestion[] {
  return asArray(asObject(value).questions).filter(isQuestion);
}

/** 属于出题链的 agent：蓝图 + 出题各轮。 */
export function isGenerationAgent(agent: string): boolean {
  return agent === "job_blueprint" || agent.startsWith("questions_");
}

/**
 * 把同一 runId 的 AgentRun 行组装成一条可判定的记录。
 * 没有任何出题调用的 runId（比如只跑了画像）返回 null。
 */
export function assembleGenerationRecord(rows: AgentRunRow[]): GenerationRecord | null {
  const sorted = [...rows].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const questionCalls = sorted.filter(
    (row) => row.agent.startsWith("questions_") && row.event === "model_call",
  );
  if (questionCalls.length === 0) return null;

  const selections = sorted.filter(
    (row) => row.agent.startsWith("questions_") && row.event === "selection",
  );
  const blueprintSelection = sorted.find(
    (row) => row.agent === "job_blueprint" && row.event === "selection",
  );
  const blueprintMetrics = parseJson(blueprintSelection?.metricsJson ?? null);

  const firstPayload = parseJson(questionCalls[0].payloadJson);
  const context = asObject(firstPayload.interviewContext);
  const blueprint = asObject(context.jobBlueprint);

  const competencies = asArray(blueprint.competencies).flatMap((item) => {
    const competency = asObject(item);
    return typeof competency.id === "string"
      ? [{ id: competency.id, origin: competency.origin === "inferred" ? ("inferred" as const) : ("jd" as const) }]
      : [];
  });
  const projectIds = asArray(context.projects).flatMap((item) => {
    const id = asObject(item).id;
    return typeof id === "string" ? [id] : [];
  });
  const historyQuestions = asArray(context.relevantHistory).flatMap((item) => {
    const question = asObject(item).question;
    return typeof question === "string" ? [question] : [];
  });

  const lastSelectionOutput = parseJson(selections.at(-1)?.outputJson ?? null);
  const acceptedRaw = lastSelectionOutput.accepted;
  const accepted = Array.isArray(acceptedRaw) ? acceptedRaw.filter(isQuestion) : null;

  // 终轮裁决在首轮与补货的全部候选上重筛，同一道被拒的题会再记一次：按题干去重。
  const rejectedByQuestion = new Map<string, { question: string; reason: string }>();
  for (const row of selections) {
    for (const item of asArray(parseJson(row.outputJson).rejected)) {
      const entry = asObject(item);
      if (typeof entry.question === "string" && typeof entry.reason === "string") {
        rejectedByQuestion.set(entry.question, { question: entry.question, reason: entry.reason });
      }
    }
  }
  const rejected = [...rejectedByQuestion.values()];
  const loadedSkillNames = [
    ...new Set(
      selections.flatMap((row) =>
        asArray(parseJson(row.outputJson).loadedSkillNames).filter(
          (name): name is string => typeof name === "string",
        ),
      ),
    ),
  ];

  const firstSelectionMetrics = parseJson(selections[0]?.metricsJson ?? null);
  const modelCalls = sorted.filter(
    (row) => isGenerationAgent(row.agent) && row.event === "model_call",
  );

  return {
    runId: rows[0].runId,
    promptVersion: questionCalls[0].promptVersion ?? null,
    model: questionCalls[0].model ?? null,
    blueprintLevel: asNumber(blueprintMetrics.level),
    competencyCount: asNumber(blueprintMetrics.competencyCount) ?? competencies.length,
    jobDescription: typeof context.jobDescription === "string" ? context.jobDescription : "",
    competencies,
    projectIds,
    historyQuestions,
    requestedCount:
      asNumber(firstSelectionMetrics.requestedCount) ??
      asNumber(firstPayload.totalQuestionCount),
    returned: questionCalls.flatMap((row) => questionsOf(parseJson(row.outputJson))),
    accepted,
    rejected,
    loadedSkillNames,
    totalTokens: modelCalls.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
    durationMs: modelCalls.reduce((sum, row) => sum + row.durationMs, 0),
  };
}

/** 把一张表的行按 runId 分组并组装，跳过不是出题链的 runId。 */
export function assembleGenerationRecords(rows: AgentRunRow[]): GenerationRecord[] {
  const byRun = new Map<string, AgentRunRow[]>();
  for (const row of rows) {
    if (!isGenerationAgent(row.agent)) continue;
    byRun.set(row.runId, [...(byRun.get(row.runId) ?? []), row]);
  }
  return [...byRun.values()].flatMap((group) => {
    const record = assembleGenerationRecord(group);
    return record ? [record] : [];
  });
}

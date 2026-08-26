import "server-only";

import { isStepCount, tool, type LanguageModelUsage } from "ai";
import { z } from "zod";

import { loadSkillPacks } from "./skills/loader";
import { recommendSkillPacks } from "./skills/selector";
import type { SkillPack } from "./skills/types";

import { createTextModel } from "@/lib/ai/providers";
import {
  assertAiConfigured,
  isAgentTimeout,
  logAgentRun,
  runAgent,
} from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { MockInterviewContext } from "./context";
import { MockInterviewGenerationError } from "./errors";
import { createQuestionOutputSchema } from "./generation-schema";
import {
  buildQuestionPlan,
  getQuestionSourceAllocation,
  selectValidQuestions,
} from "./planning";
import {
  selectRelevantPersonalization,
  type RelevantPersonalizationContext,
} from "./relevance";
import {
  looseMockInterviewQuestionBatchSchema,
  MIN_MOCK_INTERVIEW_QUESTIONS,
  MOCK_INTERVIEW_GENERATION_TIMEOUT_MS,
  MOCK_INTERVIEW_PROMPT_VERSION,
  type MockInterviewJobBlueprint,
  type MockInterviewQuestionDraft,
  type MockInterviewQuestionPlan,
} from "./types";

type QuestionBatchStage = "questions_initial" | "questions_top_up";

/**
 * 结构化输出失败时的抢救：模型经常只是被截断，残缺 JSON 里仍有可用题目，
 * 捞回来交给后续的确定性筛选，比整批丢弃更划算。
 */
const salvageQuestionBatch = salvageJson(looseMockInterviewQuestionBatchSchema);

function parsePartialQuestions(text: string | undefined): MockInterviewQuestionDraft[] {
  return salvageQuestionBatch(text)?.questions ?? [];
}

type QuestionBatchResult = {
  questions: MockInterviewQuestionDraft[];
  finishReason?: string;
  usage?: LanguageModelUsage;
  durationMs: number;
  partial: boolean;
  loadedSkillNames: string[];
};

type SkillContext = {
  packs: SkillPack[];
  recommended: string[];
  /** tools=agent 自主加载（渐进式披露）；injected=兜底确定性全文注入。 */
  mode: "tools" | "injected";
};

/** name/description 恒可见清单——agent 判断加载哪些包的依据。 */
function skillCatalog(skills: SkillContext): string {
  return skills.packs
    .map(
      (pack) =>
        `- ${pack.name}（${pack.layer}${skills.recommended.includes(pack.name) ? "，推荐" : ""}）：${pack.description}`,
    )
    .join("\n");
}

function injectedSkillBodies(skills: SkillContext): string {
  const byName = new Map(skills.packs.map((pack) => [pack.name, pack]));
  return skills.recommended
    .flatMap((name) => {
      const pack = byName.get(name);
      return pack ? [`### 技能包：${pack.name}\n${pack.body}`] : [];
    })
    .join("\n\n");
}

function promptContext(input: {
  context: MockInterviewContext;
  blueprint: MockInterviewJobBlueprint;
  personalization: RelevantPersonalizationContext;
}) {
  return {
    jobDescription: input.context.jobDescription,
    jobBlueprint: input.blueprint,
    resume: input.context.resume,
    projects: input.context.projects,
    relevantHistory: input.personalization.history.map((item) => ({
      interviewId: item.interviewId,
      companyName: item.companyName,
      jobTitle: item.jobTitle,
      questionId: item.questionId,
      question: item.question,
      answer: item.answer.slice(0, 1_200),
      category: item.category,
      jobCompetencyId: item.jobCompetencyId,
      jobRelevance: item.jobRelevance,
    })),
    relevantProfileInsights: input.personalization.profileInsights,
  };
}

async function requestQuestionBatch(input: {
  generationId: string;
  stage: QuestionBatchStage;
  config: Awaited<ReturnType<typeof getAiTaskConfig>>;
  modelInstance: ReturnType<typeof createTextModel>;
  questionCount: number;
  totalQuestionCount: number;
  difficulty: string;
  round: string | null;
  context: ReturnType<typeof promptContext>;
  existingQuestions: MockInterviewQuestionDraft[];
  seedSourceId?: string | null;
  skills: SkillContext;
}): Promise<QuestionBatchResult> {
  const allocation = getQuestionSourceAllocation(
    input.totalQuestionCount,
    Boolean(input.seedSourceId),
    input.context.jobBlueprint,
  );
  const packsByName = new Map(input.skills.packs.map((pack) => [pack.name, pack]));
  const loadedSkillNames: string[] = [];
  const loadSkillTool = tool({
    description:
      "加载一个面试技能包的全文出题指导。按上文技能包清单的 description 判断相关性，出题前先加载 2-3 个最相关的包（含推荐标记的）。",
    inputSchema: z.object({ name: z.string().min(1).max(64) }),
    execute: async ({ name }) => {
      const pack = packsByName.get(name);
      if (!pack) return `技能包 ${name} 不存在。可用：${[...packsByName.keys()].join(", ")}`;
      const parts: string[] = [];
      // 栈包自动附带父级领域包，架构方法论不缺席。
      if (pack.parent && !loadedSkillNames.includes(pack.parent)) {
        const parent = packsByName.get(pack.parent);
        if (parent) {
          loadedSkillNames.push(parent.name);
          parts.push(`### 技能包：${parent.name}\n${parent.body}`);
        }
      }
      if (!loadedSkillNames.includes(pack.name)) loadedSkillNames.push(pack.name);
      parts.push(`### 技能包：${pack.name}\n${pack.body}`);
      return parts.join("\n\n");
    },
  });
  const skillSection =
    input.skills.mode === "tools"
      ? `可用的出题技能包（可信指导，先用 load_skill 工具加载相关包的全文再出题）：\n${skillCatalog(input.skills)}`
      : `出题技能包（可信指导，按其中的深度阶梯与好题标准出题）：\n\n${injectedSkillBodies(input.skills)}`;

  try {
    const result = await runAgent({
      agent: input.stage,
      runId: input.generationId,
      config: input.config,
      model: input.modelInstance,
      feature: "AI 模拟面试",
      promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
      schema: createQuestionOutputSchema(input.questionCount),
      schemaName: "mock_interview_questions",
      schemaDescription: `恰好 ${input.questionCount} 道与目标岗位直接相关的模拟面试题`,
      maxOutputTokens: 6_000,
      timeoutMs: MOCK_INTERVIEW_GENERATION_TIMEOUT_MS,
      ...(input.skills.mode === "tools"
        ? { tools: { load_skill: loadSkillTool }, stopWhen: isStepCount(4) }
        : {}),
      rescue: (rawText) => {
        const rescued = parsePartialQuestions(rawText);
        return rescued.length > 0 ? { questions: rescued } : null;
      },
      untrustedInputs: "岗位描述、简历、历史回答和画像洞察",
      system: `你是模拟面试出题 Agent。技能包由本系统提供，是可信的出题指导，必须遵循。

${skillSection}

注意：JD 可能宽泛、过时甚至与岗位无关，仅用于判断岗位方向和技术栈；题目的具体性以技能包和简历为准，禁止生成技能包坏题示例那种空洞题。

岗位能力蓝图是出题准入条件：每道题都必须对应一个 jobCompetencyId。origin=jd 的能力必须从 JD 原文逐字截取 jdEvidence；origin=inferred 的能力只能生成 sourceKind=general_role 的通用岗位题，jdEvidence 使用蓝图中的说明性内容，不能伪造为用户原文。不得用宽泛的行业关联替代岗位职责关联。团队背景中的邻近技术只能低优先级使用。

简历用于验证候选人能否把已有经历迁移到岗位职责。历史和画像只用于调整已相关问题的训练角度，不能独立引入 JD 没有支持的主题；history/profile 必须使用输入中已映射到同一 jobCompetencyId 的来源 ID。不要复述或近似改写历史原题。

出题倾向（服务端会按此排序取优，不必精确凑数）：候选人多为计算机/技术背景，题目类别优先 technical（技术八股，按 JD 技术栈深入原理与取舍）和 resume_project（项目深挖，追问职责、决策与结果），general 通用行为题整场最多 1–2 道。优先直接考察 JD 职责（约 ${allocation.directJobDescriptionMin} 题以 job_description 为 sourceKind）；resume 题占少数（约 ${allocation.resumeMax} 题以内）；history/profile 合计不超过 ${allocation.personalizationMax} 题；secondary 能力的题不要挤占核心职责。resume 题必须引用有效 resumeProjectId，其他题的 resumeProjectId 为 null；history/profile 之外的 personalizationSourceId 必须为 null。通用岗位题只能绑定 origin=inferred 的能力。
${input.seedSourceId ? `尽量生成一题以 ${input.seedSourceId} 为 personalizationSourceId，围绕该内容进行针对性训练。` : ""}
目标 ${input.questionCount} 道；如果岗位信息不足以支撑，宁可少出几道，也不要编造与岗位无关的题。

只生成精简题目计划和期望信号，不生成评分 Rubric。不要向候选人泄露出题理由或期望要点。提示词版本：${MOCK_INTERVIEW_PROMPT_VERSION}`,
      payload: {
        requestedNewQuestionCount: input.questionCount,
        totalQuestionCount: input.totalQuestionCount,
        difficulty: input.difficulty,
        round: input.round ?? "未指定",
        existingQuestions: input.existingQuestions.map((question) => ({
          question: question.question,
          sourceKind: question.sourceKind,
          jobCompetencyId: question.jobCompetencyId,
        })),
        interviewContext: input.context,
      },
    });

    return {
      questions: result.output.questions,
      finishReason: result.finishReason,
      usage: result.usage,
      durationMs: result.durationMs,
      partial: result.partial,
      loadedSkillNames,
    };
  } catch (error) {
    throw new MockInterviewGenerationError({
      code: isAgentTimeout(error) ? "model_timeout" : "question_output_invalid",
      message: isAgentTimeout(error)
        ? "面试题没有在限定时间内生成。模型服务响应较慢。你可以稍后重试，或减少题目数量。"
        : "面试题生成结果无法使用。模型没有返回符合格式的题目。你可以重新生成，或减少题目数量后重试。",
      cause: error,
    });
  }
}

export async function generateMockInterviewPlan(input: {
  generationId: string;
  context: MockInterviewContext;
  blueprint: MockInterviewJobBlueprint;
  jobTitle: string;
  questionCount: number;
  difficulty: string;
  round: string | null;
  seedQuestionId?: string | null;
  seedInsightId?: string | null;
}): Promise<{
  plan: MockInterviewQuestionPlan;
  provider: string;
  model: string;
  blueprint: MockInterviewJobBlueprint;
  personalization: RelevantPersonalizationContext;
}> {
  const config = await getAiTaskConfig("text");
  assertAiConfigured(config, "AI 模拟面试");
  const modelInstance = createTextModel(config);
  const personalization = selectRelevantPersonalization({
    context: input.context,
    blueprint: input.blueprint,
    jobTitle: input.jobTitle,
    seedQuestionId: input.seedQuestionId,
    seedInsightId: input.seedInsightId,
  });
  const seedSourceId = input.seedQuestionId ?? input.seedInsightId ?? null;
  const context = promptContext({
    context: input.context,
    blueprint: input.blueprint,
    personalization,
  });

  const logSelection = (
    stage: QuestionBatchStage,
    batch: QuestionBatchResult,
    counts: { requested: number; accepted: number; rejected: number },
  ) => {
    logAgentRun({
      runId: input.generationId,
      agent: stage,
      event: "selection",
      status: batch.partial ? "partial" : "success",
      provider: config.provider,
      model: config.model,
      promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
      durationMs: batch.durationMs,
      finishReason: batch.finishReason,
      usage: batch.usage,
      metrics: {
        requestedCount: counts.requested,
        returnedCount: batch.questions.length,
        acceptedCount: counts.accepted,
        rejectedCount: counts.rejected,
      },
    });
  };

  const packs = await loadSkillPacks();
  const recommended = recommendSkillPacks(
    {
      jobTitle: input.jobTitle,
      jobDescription: input.context.jobDescription,
      resumeText: input.context.resume.text,
    },
    packs,
  );
  const batchBase = {
    generationId: input.generationId,
    config,
    modelInstance,
    totalQuestionCount: input.questionCount,
    difficulty: input.difficulty,
    round: input.round,
    context,
    seedSourceId,
  };

  let initial = await requestQuestionBatch({
    ...batchBase,
    stage: "questions_initial",
    questionCount: input.questionCount,
    existingQuestions: [],
    skills: { packs, recommended, mode: "tools" },
  });
  // 降级链：agent 全程没加载任何技能包（弱模型常见），
  // 把推荐包确定性全文注入重试一次，保证出题知识不缺席。
  if (initial.loadedSkillNames.length === 0) {
    console.warn(
      "[mock-interviews] agent loaded no skills, retrying with injected packs:",
      recommended.join(", "),
    );
    initial = await requestQuestionBatch({
      ...batchBase,
      stage: "questions_initial",
      questionCount: input.questionCount,
      existingQuestions: [],
      skills: { packs, recommended, mode: "injected" },
    });
  }
  const initialSelection = selectValidQuestions({
    candidates: initial.questions,
    questionCount: input.questionCount,
    context: input.context,
    blueprint: input.blueprint,
    personalization,
    seedSourceId,
  });
  logSelection("questions_initial", initial, {
    requested: input.questionCount,
    accepted: initialSelection.accepted.length,
    rejected: initialSelection.rejected.length,
  });

  let accepted = initialSelection.accepted;
  if (
    seedSourceId &&
    accepted.length === input.questionCount &&
    !accepted.some((question) => question.personalizationSourceId === seedSourceId)
  ) {
    accepted = accepted.slice(0, -1);
  }
  if (accepted.length < input.questionCount) {
    const missingCount = input.questionCount - accepted.length;
    const topUp = await requestQuestionBatch({
      ...batchBase,
      stage: "questions_top_up",
      questionCount: missingCount,
      existingQuestions: accepted,
      // 补货直接注入首轮用过的包（或推荐包），省一轮工具往返。
      skills: {
        packs,
        recommended:
          initial.loadedSkillNames.length > 0 ? initial.loadedSkillNames : recommended,
        mode: "injected",
      },
    });
    const topUpSelection = selectValidQuestions({
      candidates: topUp.questions,
      existing: accepted,
      questionCount: input.questionCount,
      context: input.context,
      blueprint: input.blueprint,
      personalization,
      seedSourceId,
    });
    accepted = topUpSelection.accepted;
    logSelection("questions_top_up", topUp, {
      requested: missingCount,
      accepted: accepted.length,
      rejected: topUpSelection.rejected.length,
    });
  }

  // 数量软化：达到下限就开场，差额由房间如实说明；只有连底线都凑不齐才失败。
  // seed 没被覆盖不再作废整场——已生成的题仍然贴合岗位，照常交付。
  if (accepted.length < MIN_MOCK_INTERVIEW_QUESTIONS) {
    throw new MockInterviewGenerationError({
      code: "question_validation_failed",
      message: `没能生成足够的题目。通过检查的题目少于 ${MIN_MOCK_INTERVIEW_QUESTIONS} 道。你可以补充岗位职责、让 AI 补全常见要求，或减少题目数量。`,
      context: {
        competencyCount: input.blueprint.competencies.length,
        requiredCount: MIN_MOCK_INTERVIEW_QUESTIONS,
        jobTitle: input.jobTitle,
        questionCount: input.questionCount,
      },
    });
  }

  return {
    plan: buildQuestionPlan(accepted),
    provider: config.provider,
    model: config.model,
    blueprint: input.blueprint,
    personalization,
  };
}

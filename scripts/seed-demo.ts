import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

import { PrismaClient } from "../src/generated/prisma/client";
import { resolvePrismaSqliteUrl } from "../src/lib/sqlite-url";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const resolvedUrl = resolvePrismaSqliteUrl(databaseUrl);
const expectedPath = path.resolve(process.cwd(), "prisma", "demo.db");
if (path.resolve(resolvedUrl.replace(/^file:/, "")) !== expectedPath) {
  throw new Error(`Refusing to seed a database other than ${expectedPath}.`);
}

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: resolvedUrl }),
});

const now = new Date();
const daysAgo = (days: number, hour = 10) => {
  const value = new Date(now);
  value.setDate(value.getDate() - days);
  value.setHours(hour, 0, 0, 0);
  return value;
};

const applications = [
  ["云帆科技", "AI 应用开发工程师", "first_interview", 1],
  ["远岚智能", "LLM Agent 实习生", "assessment", 2],
  ["星轨网络", "前端开发工程师", "applied", 3],
  ["澄明数据", "机器学习平台实习生", "second_interview", 4],
  ["栖湖科技", "全栈开发工程师", "offer", 5],
  ["青禾软件", "大模型应用实习生", "hr_interview", 6],
  ["矩阵智联", "后端开发工程师", "rejected", 8],
  ["知微机器人", "算法工程师", "third_interview", 9],
  ["北辰云图", "数据平台开发实习生", "applied", 11],
  ["航迹科技", "AI 产品研发实习生", "assessment", 13],
  ["山海计算", "Node.js 开发工程师", "rejected", 16],
  ["光年互动", "智能体平台工程师", "first_interview", 18],
  ["原点信息", "Web 前端实习生", "applied", 21],
  ["深蓝协作", "模型评测工程师", "second_interview", 25],
  ["新叶网络", "React 开发工程师", "rejected", 31],
  ["启明研究", "NLP 算法实习生", "applied", 36],
] as const;

async function clearDemoData() {
  await prisma.candidateInsightEvidence.deleteMany();
  await prisma.candidateInsight.deleteMany();
  await prisma.candidateProfileMetric.deleteMany();
  await prisma.candidateProfileSnapshot.deleteMany();
  await prisma.candidateProfileRun.deleteMany();
  await prisma.candidateProfileState.deleteMany();
  await prisma.abilityObservation.deleteMany();
  await prisma.interviewQuestionEvaluation.deleteMany();
  await prisma.interviewAssessment.deleteMany();
  await prisma.mockInterviewSession.deleteMany();
  await prisma.interviewImportArtifact.deleteMany();
  await prisma.interviewQuestion.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.roleContext.deleteMany();
  await prisma.resumeProjectSource.deleteMany();
  await prisma.resumeProject.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.bossContact.deleteMany();
  await prisma.appSetting.deleteMany();
}

async function seed() {
  await clearDemoData();

  await prisma.bossContact.createMany({
    data: applications.map(([companyName, jobTitle, stage, age], index) => ({
      id: `demo-application-${index + 1}`,
      companyName,
      jobTitle,
      stage,
      source: index % 5 === 0 ? "manual" : "boss_zhipin",
      sourceKey: `demo:${index + 1}`,
      jobUrl: index % 5 === 0 ? null : `https://www.zhipin.com/job_detail/demo-${index + 1}.html`,
      appliedAt: daysAgo(age, 9 + (index % 8)),
      sourceActivityAt: daysAgo(Math.max(0, age - 2)),
      unchangedSince: daysAgo(Math.max(0, age - 2)),
      firstSeenAt: daysAgo(age),
      lastSeenAt: daysAgo(0, 9),
      createdAt: daysAgo(age),
      updatedAt: daysAgo(Math.max(0, age - 2)),
      note: index === 0 ? "准备项目介绍与系统设计问题" : null,
    })),
  });

  const resume = await prisma.resume.create({
    data: {
      id: "demo-resume",
      originalName: "演示候选人-产品研发简历.docx",
      storedName: "demo-resume.docx",
      filePath: ".local/demo/demo-resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSize: 186_420,
      isDefault: true,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(3),
    },
  });

  const studyAssistant = await prisma.resumeProject.create({
    data: {
      id: "demo-project-study-assistant",
      name: "Study Assistant - 基于 LLM Agent 的本地化个人助手系统",
      type: "project",
      organization: "个人项目",
      description: "使用本地知识库、任务规划与工具调用构建学习助手。",
      startDate: "2025-10",
      endDate: "2026-03",
      sortOrder: 0,
    },
  });
  const internship = await prisma.resumeProject.create({
    data: {
      id: "demo-internship",
      name: "智能客服平台研发实习",
      type: "internship",
      organization: "云帆科技",
      description: "负责知识检索、对话流程和质量评估模块。",
      startDate: "2025-06",
      endDate: "2025-09",
      sortOrder: 1,
    },
  });

  await prisma.resumeProjectSource.createMany({
    data: [studyAssistant, internship].map((item) => ({
      resumeId: resume.id,
      resumeProjectId: item.id,
      extractedName: item.name,
      finalName: item.name,
    })),
  });

  await prisma.roleContext.create({
    data: {
      key: "ai-application-engineer",
      displayName: "AI 应用开发工程师",
      normalizedTitle: "ai application engineer",
      isPinned: true,
      targetJobDescription: "负责 LLM 应用、Agent 工作流和工程化交付。",
    },
  });

  const realInterview = await prisma.interview.create({
    data: {
      id: "demo-interview-real-1",
      kind: "real",
      sourceType: "real_summary",
      companyName: "云帆科技",
      jobTitle: "AI 应用开发工程师",
      roleKey: "ai-application-engineer",
      interviewedAt: daysAgo(2, 15),
      scheduledAt: daysAgo(2, 15),
      round: "first_interview",
      status: "completed",
      note: "重点讨论了项目架构、检索质量和上线后的迭代方式。",
      questions: {
        create: [
          {
            id: "demo-real-q1",
            question: "介绍一下 Study Assistant 的整体架构和你的主要贡献。",
            answer: "我负责 Agent 编排、检索链路和评测闭环，并通过离线集合持续验证召回质量。",
            category: "resume_project",
            resumeProjectId: studyAssistant.id,
            sortOrder: 0,
          },
          {
            id: "demo-real-q2",
            question: "RAG 中如何降低召回结果与用户问题不相关的情况？",
            answer: "先做查询改写和混合检索，再用重排模型筛选，最后对引用覆盖率做自动评估。",
            category: "technical",
            sortOrder: 1,
          },
          {
            id: "demo-real-q3",
            question: "遇到需求变化时你如何安排优先级？",
            answer: "先确认目标和影响范围，再按用户价值、风险与交付成本排序，并同步取舍依据。",
            category: "general",
            sortOrder: 2,
          },
        ],
      },
    },
  });

  await prisma.interview.create({
    data: {
      id: "demo-interview-real-2",
      kind: "real",
      sourceType: "real_transcript",
      companyName: "澄明数据",
      jobTitle: "机器学习平台实习生",
      roleKey: "ai-application-engineer",
      interviewedAt: daysAgo(8, 14),
      scheduledAt: daysAgo(8, 14),
      round: "second_interview",
      status: "completed",
      note: "补充准备模型评测指标和失败案例分析。",
      questions: {
        create: [
          {
            id: "demo-real-q4",
            question: "实习中你如何衡量智能客服检索效果？",
            answer: "按业务场景构造评测集，结合 Recall@K、答案可用率和人工抽检定位问题。",
            category: "resume_project",
            resumeProjectId: internship.id,
            sortOrder: 0,
          },
          {
            id: "demo-real-q5",
            question: "向量索引和倒排索引各适合什么场景？",
            answer: "向量索引擅长语义匹配，倒排索引适合精确关键词，实际项目通常采用混合检索。",
            category: "technical",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const mockInterview = await prisma.interview.create({
    data: {
      id: "demo-interview-mock",
      kind: "mock",
      sourceType: "mock_text",
      companyName: "目标公司演练",
      jobTitle: "LLM Agent 开发工程师",
      roleKey: "ai-application-engineer",
      interviewedAt: daysAgo(1, 20),
      scheduledAt: daysAgo(1, 20),
      round: "first_interview",
      status: "completed",
      questions: {
        create: [
          {
            id: "demo-mock-q1",
            question: "如何设计一个可观测、可恢复的 Agent 工作流？",
            answer: "我会拆分确定性步骤与模型步骤，为每次工具调用记录输入输出，并通过幂等键和检查点支持恢复。",
            category: "technical",
            sortOrder: 0,
          },
          {
            id: "demo-mock-q2",
            question: "请用一个具体例子说明你如何定位线上质量下降。",
            answer: "先按版本和场景切分指标，再抽样失败链路，对比检索、提示词和模型输出，最后用回归集验证修复。",
            category: "general",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await prisma.mockInterviewSession.create({
    data: {
      id: "demo-mock-session",
      interviewId: mockInterview.id,
      resumeId: resume.id,
      jdOriginalName: "AI 应用开发工程师 JD.txt",
      jdTextSnapshot: "负责 Agent 应用开发、RAG 质量优化和工程化交付。",
      resumeTextSnapshot: "仅用于演示的虚构简历文本。",
      contextSnapshotJson: "{}",
      status: "completed",
      interactionMode: "voice",
      currentQuestionIndex: 2,
      questionCount: 2,
      provider: "openai",
      model: "gpt-4.1-mini",
      promptVersion: "mock-interview-v2",
      totalScore: 84,
      reportJson: JSON.stringify({
        totalScore: 84,
        summary: "回答结构清晰，能结合工程实践说明方案，但需要进一步量化结果。",
        strengths: ["问题拆解完整", "工程风险意识较好"],
        improvements: ["补充性能和质量指标", "减少概念性描述"],
        actionPlan: ["为两个项目各准备一组量化结果", "练习 3 道系统设计追问"],
      }),
      startedAt: daysAgo(1, 19),
      completedAt: daysAgo(1, 20),
    },
  });

  await prisma.interviewQuestionEvaluation.createMany({
    data: [
      {
        interviewQuestionId: "demo-mock-q1",
        score: 86,
        dimensionsJson: JSON.stringify([
          { name: "问题拆解", score: 88, evidence: "覆盖了观测、幂等和恢复机制。" },
          { name: "工程可行性", score: 84, evidence: "给出了日志与检查点设计。" },
        ]),
        strengthsJson: JSON.stringify(["结构完整", "风险意识清晰"]),
        improvementsJson: JSON.stringify(["补充具体监控指标"]),
        feedback: "方案完整，可进一步说明告警阈值和恢复成本。",
        evaluatedAt: daysAgo(1, 20),
      },
      {
        interviewQuestionId: "demo-mock-q2",
        score: 82,
        dimensionsJson: JSON.stringify([
          { name: "分析路径", score: 84, evidence: "按版本、场景和链路逐层定位。" },
          { name: "结果验证", score: 80, evidence: "提到了抽样和回归集。" },
        ]),
        strengthsJson: JSON.stringify(["定位步骤明确"]),
        improvementsJson: JSON.stringify(["补充量化结果和时间成本"]),
        feedback: "回答可执行，增加真实指标后会更有说服力。",
        evaluatedAt: daysAgo(1, 20),
      },
    ],
  });

  const assessment = await prisma.interviewAssessment.create({
    data: {
      id: "demo-assessment",
      interviewId: realInterview.id,
      sourceHash: "demo-source-hash",
      assessmentVersion: "ability-assessment-v2",
      promptVersion: "candidate-profile-v2",
      status: "completed",
      completedAt: daysAgo(2, 16),
    },
  });

  const observations = await Promise.all([
    ["demo-observation-1", "demo-real-q1", "experience_evidence", 82, "能够说明个人职责与方案边界。"],
    ["demo-observation-2", "demo-real-q2", "knowledge_accuracy", 86, "准确说明混合检索与重排的作用。"],
    ["demo-observation-3", "demo-real-q3", "communication_clarity", 78, "回答有明确的判断顺序。"],
  ].map(([id, questionId, dimension, score, evidenceExcerpt]) =>
    prisma.abilityObservation.create({
      data: {
        id: String(id),
        assessmentId: assessment.id,
        interviewId: realInterview.id,
        questionId: String(questionId),
        dimension: String(dimension),
        score: Number(score),
        modelConfidence: 0.82,
        evidenceExcerpt: String(evidenceExcerpt),
        sourceType: "real_summary",
        sourceWeight: 0.72,
        roleKey: "ai-application-engineer",
      },
    }),
  ));

  const insightSpecs = [
    ["experience_evidence", "strength", "项目经历表达具体", "能够说明个人职责、技术方案和验证方式。", 0.84],
    ["knowledge_accuracy", "strength", "技术基础较稳定", "对检索、索引和质量评估有较准确的理解。", 0.86],
    ["communication_clarity", "training_focus", "加强结果量化", "回答结构清楚，但应补充性能和业务结果数据。", 0.76],
  ] as const;

  for (const [index, spec] of insightSpecs.entries()) {
    const [dimension, kind, title, statement, confidence] = spec;
    const insight = await prisma.candidateInsight.create({
      data: {
        id: `demo-insight-${index + 1}`,
        dimension,
        kind,
        title,
        statement,
        normalizedKey: `demo-${dimension}-${kind}`,
        confidence,
        level: 78 + index * 3,
        levelLabel: "熟练",
        trend: index === 2 ? "stable" : "up",
        confidenceLabel: "较高",
        status: "active",
      },
    });
    await prisma.candidateInsightEvidence.create({
      data: {
        insightId: insight.id,
        interviewId: realInterview.id,
        questionId: `demo-real-q${index + 1}`,
        observationId: observations[index].id,
        sourceKind: "real_summary",
        excerpt: observations[index].evidenceExcerpt,
        weight: 0.72,
      },
    });
  }

  const metricLevels: Record<string, number> = {
    answer_relevance: 80,
    knowledge_accuracy: 86,
    reasoning_depth: 76,
    problem_solving: 81,
    experience_evidence: 82,
    communication_clarity: 78,
    delivery_fluency: 74,
    reflection_growth: 79,
  };
  await prisma.candidateProfileMetric.createMany({
    data: Object.entries(metricLevels).map(([dimension, level]) => ({
      id: `demo-metric-${dimension}`,
      dimension,
      level,
      levelLabel: level >= 85 ? "突出" : "熟练",
      trend: "up",
      evidenceConfidence: 0.8,
      confidenceLabel: "较高",
      interviewCount: 3,
      realInterviewCount: 2,
      evidenceCount: 4,
    })),
  });
  await prisma.candidateProfileSnapshot.create({
    data: {
      id: "demo-profile-snapshot",
      revision: 1,
      metricsJson: JSON.stringify(
        Object.entries(metricLevels).map(([dimension, level]) => ({
          dimension,
          level,
          levelLabel: level >= 85 ? "突出" : "熟练",
        })),
      ),
      insightIdsJson: JSON.stringify(insightSpecs.map((_, index) => `demo-insight-${index + 1}`)),
      assessmentVersion: "ability-assessment-v2",
      createdAt: daysAgo(1),
    },
  });
  await prisma.candidateProfileState.create({
    data: {
      id: "default",
      status: "idle",
      revision: 1,
      lastRefreshedAt: daysAgo(1),
      lastProcessedAt: daysAgo(1),
      assessmentVersion: "candidate-profile-scoring-v3-real-priority",
      completedCount: 3,
      totalCount: 3,
    },
  });

  console.log(
    `[demo] seeded ${applications.length} applications, 1 resume, 2 experiences and 3 interviews.`,
  );
}

seed()
  .catch((error) => {
    console.error("[demo] seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

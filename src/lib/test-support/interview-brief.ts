import { rubricForArea, type InterviewArea, type InterviewBrief, type InterviewPace } from "@/lib/mock-interviews/brief/brief";

/**
 * 测试用的 v8 简报（材料）：一个项目的两个面、四道基础题、一道场景题，标准节奏。
 * reducer / 对话窗口 / 服务层 / 体验版的测试共用同一份，形状变了只改这里。
 */

const round = "first_interview";

export const TEST_AREAS: InterviewArea[] = [
  {
    id: "p1-overview",
    kind: "project",
    name: "Study Assistant：背景与架构",
    projectId: "proj-1",
    angle: "overview",
    competencyIds: [],
    jdEvidence: null,
    anchor: null,
    skill: null,
    entryQuestion: "先整体讲讲 Study Assistant：解决什么问题、架构是怎样的、你负责哪一块？",
    guides: ["工具链路", "安全链路"],
    expectedSignals: ["模块划分", "个人职责"],
    rubric: rubricForArea("project", round),
  },
  {
    id: "p1-module",
    kind: "project",
    name: "Study Assistant：模块深挖",
    projectId: "proj-1",
    angle: "module",
    competencyIds: [],
    jdEvidence: null,
    anchor: null,
    skill: null,
    entryQuestion: "先聊项目：主循环里你负责哪一段？",
    guides: ["你负责的边界", "为什么这么设计", "怎么量的"],
    expectedSignals: ["个人职责", "取舍"],
    rubric: rubricForArea("project", round),
  },
  ...["缓存一致性", "MySQL 索引", "消息队列可靠投递", "HTTP 缓存"].map((name, index): InterviewArea => ({
    id: `q${index + 1}`,
    kind: "quick",
    name,
    projectId: null,
    angle: null,
    competencyIds: [],
    jdEvidence: null,
    anchor: index === 0 ? { kind: "resume", quote: "Redis 缓存热门列表" } : null,
    skill: "backend",
    entryQuestion: `${name}：最关键的一个机制是什么？`,
    guides: ["追问它的边界条件"],
    expectedSignals: ["机制准确"],
    rubric: rubricForArea("quick", round),
  })),
  {
    id: "s1",
    kind: "scenario",
    name: "场景：秒杀超卖排查",
    projectId: null,
    angle: null,
    competencyIds: ["c1"],
    jdEvidence: "工具调用",
    anchor: null,
    skill: null,
    entryQuestion: "秒杀系统偶发超卖，你会先看哪一步？",
    guides: ["追问为什么先看这里", "追问条件变了怎么办", "追问怎么验证"],
    expectedSignals: ["排查顺序", "验证方式"],
    rubric: rubricForArea("scenario", round),
  },
];

export function testBrief(overrides: Partial<InterviewBrief> & { pace?: InterviewPace } = {}): InterviewBrief {
  const pace = overrides.pace ?? "standard";
  return {
    version: 8,
    pace,
    round,
    product: null,
    askIntro: true,
    areas: TEST_AREAS,
    hypotheses: [],
    skillPacks: ["backend", "project-deep-dive"],
    source: "model",
    ...overrides,
  };
}

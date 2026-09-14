import type { TopicPack, TopicPackRole } from "./selector";
import type { SkillPack } from "./types";

/**
 * 技能包里的主题：备课的基础快问题池从这里抽。
 *
 * 抽样在代码里而不是交给模型选：模型对同样的 JD + 简历每次都挑同样的主题，每场撞上一场。
 * 代码按包的角色分名额（岗位领域包占大头，语言栈与计算机基础各点缀几道）、按 JD 与简历加权、
 * 对最近问过的降权、带随机；模型只负责把抽中的主题写成一道具体的题。
 */

export type SkillTopic = {
  skill: string;
  name: string;
  ladder: string;
  /** 包里的好题：模型写不出时的兜底题目。 */
  example: string;
  redFlags: string;
  signals: string;
  /** 标了"（可选）"的主题：只在别的主题不够时补。 */
  optional: boolean;
  /** 候选人简历碰过这个主题：备课把题写成"从他项目里用到的 X 出发"。抽样时标上。 */
  fromResume: boolean;
};

const TOPICS_HEADING = "## 主题";
const OPTIONAL_MARK = /（可选）$/;
const FIELDS = { ladder: "阶梯", example: "好题", redFlags: "危险信号", signals: "期望信号" } as const;

/** 解析 SKILL.md 的"## 主题"段：每个 ### 一个主题，四条固定字段。 */
export function parseSkillTopics(pack: SkillPack): SkillTopic[] {
  const lines = pack.body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === TOPICS_HEADING);
  if (start < 0) return [];
  const topics: SkillTopic[] = [];
  let current: SkillTopic | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    const heading = line.match(/^### (.+)$/);
    if (heading) {
      const title = heading[1].trim();
      current = { skill: pack.name, name: title.replace(OPTIONAL_MARK, "").trim(), optional: OPTIONAL_MARK.test(title), fromResume: false, ladder: "", example: "", redFlags: "", signals: "" };
      topics.push(current);
      continue;
    }
    const bullet = current ? line.match(/^- ([^：]+)：(.*)$/) : null;
    if (!bullet || !current) continue;
    const label = bullet[1].trim();
    for (const [key, name] of Object.entries(FIELDS) as [keyof typeof FIELDS, string][]) {
      if (label === name) current[key] = bullet[2].trim();
    }
  }
  return topics.filter((topic) => topic.example.length > 0);
}

/**
 * 主题名切成整词：拉丁词（≥2 字符）与按 与 / 、 / 冒号 / 括号 / 斜杠 / 空格 切出来的中文词（≥2 字）。
 * "推理优化与部署" → 推理优化、部署；"RAG 链路设计与失败归因" → rag、链路设计、失败归因。
 * 不按二字片段：那样"优化""设计""工程"这些哪份 JD 都有的词会决定权重，题池老是同几道。
 */
export function topicTerms(name: string): string[] {
  const parts = new Set<string>();
  for (const word of name.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []) parts.add(word);
  for (const word of name.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (const term of word.split(/[与、]/)) if (term.length >= 2) parts.add(term);
  }
  return [...parts];
}

function hitRatio(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  return terms.filter((term) => text.includes(term)).length / terms.length;
}

export type TopicContext = {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  /** 最近几场同岗位问过的主题名：降权，不硬排除（题池小的时候还得靠它们）。 */
  recent: string[];
};

const RECENT_PENALTY = 0.15;
const OPTIONAL_PENALTY = 0.5;
const MIN_WEIGHT = 0.2;
/** 简历碰过：主题名里至少一半的词在简历里出现。 */
const RESUME_TOUCH_RATIO = 0.5;

/** 简历里提到过这个主题：候选人项目碰过的东西，基础题从它的项目出发问原理。 */
export function topicFromResume(topic: Pick<SkillTopic, "name">, resumeText: string): boolean {
  return hitRatio(resumeText.toLowerCase(), topicTerms(topic.name)) >= RESUME_TOUCH_RATIO;
}

/**
 * 主题权重：岗位名与 JD 提到的加分，简历碰过的也加分（真实面试的基础题多从候选人项目里长出来）；
 * 最近问过的和可选主题降权。包与包之间不比权重——名额按角色分（sampleTopicPool）。
 */
export function topicWeight(topic: SkillTopic, context: TopicContext): number {
  const terms = topicTerms(topic.name);
  const jd = hitRatio(context.jobDescription.toLowerCase(), terms);
  const title = hitRatio(context.jobTitle.toLowerCase(), terms);
  const resume = hitRatio(context.resumeText.toLowerCase(), terms);
  let weight = Math.max(MIN_WEIGHT, 0.5 + 2 * jd + title + 0.5 * resume);
  if (topic.optional) weight *= OPTIONAL_PENALTY;
  if (context.recent.some((name) => name === topic.name)) weight *= RECENT_PENALTY;
  return weight;
}

/**
 * 按权重不放回抽样（Efraimidis–Spirakis：key = u^(1/w)，取最大的 count 个）。
 * 同一个主题名只保留一次（栈包与领域包可能重名）。
 */
export function sampleTopics(topics: SkillTopic[], count: number, context: TopicContext, random: () => number = Math.random): SkillTopic[] {
  const seen = new Set<string>();
  const unique = topics.filter((topic) => (seen.has(topic.name) ? false : (seen.add(topic.name), true)));
  return unique
    .map((topic) => ({ topic, key: Math.pow(random(), 1 / topicWeight(topic, context)) }))
    .sort((left, right) => right.key - left.key)
    .slice(0, count)
    .map((item) => item.topic);
}

/** 语言栈与计算机基础各占题池的这个比例（至少 1 道），其余全给岗位领域包。 */
const SIDE_ROLE_SHARE = 1 / 6;
const SIDE_ROLES: TopicPackRole[] = ["stack", "basics"];

/**
 * 按角色分名额抽题池：领域包占大头，栈包与基础包各 1/6（有就抽，没有名额顺延给领域包）。
 * 抽到的主题标上是否在简历里出现过，备课据此把题写成"从他项目出发"。
 */
export function sampleTopicPool(packs: TopicPack[], size: number, context: TopicContext, random: () => number = Math.random): SkillTopic[] {
  const byRole = (role: TopicPackRole) => packs.filter((item) => item.role === role).flatMap((item) => parseSkillTopics(item.pack));
  const side = SIDE_ROLES.flatMap((role) => {
    const topics = byRole(role);
    return topics.length > 0 ? sampleTopics(topics, Math.max(1, Math.round(size * SIDE_ROLE_SHARE)), context, random) : [];
  });
  const domain = sampleTopics(byRole("domain"), Math.max(0, size - side.length), context, random);
  return [...domain, ...side].map((topic) => ({ ...topic, fromResume: topicFromResume(topic, context.resumeText) }));
}

/** 包正文里某个二级标题下的整段（不含标题），没有时为空串；备课提示词里引岗位职责与出题原则。 */
export function skillSection(pack: SkillPack, heading: string): string {
  const lines = pack.body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return rest.slice(0, end < 0 ? undefined : end).join("\n").trim();
}

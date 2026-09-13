import type { SkillPack } from "./types";

/**
 * 技能包里的主题：备课的基础快问题池从这里抽。
 *
 * 抽样在代码里而不是交给模型选：模型对同样的 JD + 简历每次都挑与简历最像的那两个主题，
 * 于是技术题撞项目、每场撞上一场。代码按岗位加权、对简历已展示的和最近问过的降权、带随机，
 * 模型只负责把抽中的主题写成一道具体的题。
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
      current = { skill: pack.name, name: title.replace(OPTIONAL_MARK, "").trim(), optional: OPTIONAL_MARK.test(title), ladder: "", example: "", redFlags: "", signals: "" };
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

/** 主题名切成可匹配的片段：拉丁词（≥2 字符）与中文二字组。 */
function fragments(name: string): string[] {
  const parts = new Set<string>();
  for (const word of name.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []) parts.add(word);
  for (const run of name.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let index = 0; index + 2 <= run.length; index += 1) parts.add(run.slice(index, index + 2));
  }
  return [...parts];
}

function hitRatio(text: string, parts: string[]): number {
  if (parts.length === 0) return 0;
  return parts.filter((part) => text.includes(part)).length / parts.length;
}

export type TopicContext = {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  /** 最近几场同岗位问过的主题名：降权，不硬排除（题池小的时候还得靠它们）。 */
  recent: string[];
  /** 岗位对应的领域包：它的主题加分，栈包的主题只作补充。 */
  primarySkill?: string;
};

const RECENT_PENALTY = 0.15;
const OPTIONAL_PENALTY = 0.5;
const PRIMARY_BONUS = 1;
const MIN_WEIGHT = 0.2;

/**
 * 主题权重：岗位领域包与岗位名、JD 提到的加分；简历已经展示、而 JD 没提的减分（项目阶段会考到它，
 * 基础题考简历没露的；JD 点名要的不减）；最近问过的和可选主题降权。
 */
export function topicWeight(topic: SkillTopic, context: TopicContext): number {
  const parts = fragments(topic.name);
  const jd = hitRatio(context.jobDescription.toLowerCase(), parts);
  const title = hitRatio(context.jobTitle.toLowerCase(), parts);
  const resume = hitRatio(context.resumeText.toLowerCase(), parts);
  const primary = topic.skill === context.primarySkill ? PRIMARY_BONUS : 0;
  let weight = Math.max(MIN_WEIGHT, 0.5 + primary + 2 * jd + title - 0.5 * resume * (1 - jd));
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

/** 包正文里某个二级标题下的整段（不含标题），没有时为空串；备课提示词里引岗位职责与出题原则。 */
export function skillSection(pack: SkillPack, heading: string): string {
  const lines = pack.body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return rest.slice(0, end < 0 ? undefined : end).join("\n").trim();
}

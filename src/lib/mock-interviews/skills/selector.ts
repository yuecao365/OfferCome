import type { SkillPack } from "./types";

/**
 * 技能包的选择。
 *
 * 关键词打分：岗位名最高，JD 次之，简历最低——面试考的是这个岗位，简历只决定语言栈与项目；
 * 简历权重高时，后端简历投前端 / 测开 / 运维岗会把后端与 AI 包顶到前面，备课就跟着简历跑偏。
 * 题池的领域包只看岗位名与 JD；语言栈包在 JD 没点名时才看简历。
 */

const TITLE_WEIGHT = 3;
const JD_WEIGHT = 2;
const RESUME_WEIGHT = 1;
const FALLBACK_DOMAIN = "cs-fundamentals";
const BASICS_PACK = "cs-fundamentals";
const HR_PACK = "behavioral";

export type SkillSelectionInput = {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
};

function hits(pack: SkillPack, text: string): number {
  const haystack = text.toLowerCase();
  return pack.keywords.filter((keyword) => keyword.trim().length > 0 && haystack.includes(keyword.toLowerCase())).length;
}

function keywordScore(pack: SkillPack, input: SkillSelectionInput): number {
  return hits(pack, input.resumeText) * RESUME_WEIGHT + hits(pack, input.jobTitle) * TITLE_WEIGHT + hits(pack, input.jobDescription) * JD_WEIGHT;
}

/**
 * 按相关性排序：base 层固定在前；其余按关键词得分降序，得分为 0 的排在最后；
 * stack 包总在其父级 domain 包之后。
 */
export function rankSkillPacks(input: SkillSelectionInput, packs: SkillPack[]): SkillPack[] {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const scored = packs
    .filter((pack) => pack.layer !== "base")
    .map((pack) => ({ pack, score: keywordScore(pack, input) }))
    .sort((left, right) => right.score - left.score);

  const ordered: SkillPack[] = packs.filter((pack) => pack.layer === "base");
  const push = (pack: SkillPack) => {
    if (!ordered.includes(pack)) ordered.push(pack);
  };
  for (const { pack } of scored) {
    const parent = pack.parent ? byName.get(pack.parent) : null;
    if (parent) push(parent);
    push(pack);
  }
  return ordered;
}

/** 题池里一个包扮演的角色：岗位领域、候选人的语言栈、计算机基础；抽样按角色分配名额（topics.ts）。 */
export type TopicPackRole = "domain" | "stack" | "basics";
export type TopicPack = { pack: SkillPack; role: TopicPackRole };

/**
 * 岗位要哪门语言栈：岗位名或 JD 明确点到一门（只命中一个栈包）就是它；JD 罗列几门"至少一门"或不提时，
 * 用简历里最突出的那门——真实面试里语言基础题跟着候选人自己的语言走（Java 简历问 HashMap，Python 简历问 GIL）。
 */
function stackPackFor(input: SkillSelectionInput, packs: SkillPack[]): SkillPack | null {
  const stacks = packs.filter((pack) => pack.layer === "stack");
  const required = stacks.filter((pack) => hits(pack, `${input.jobTitle}
${input.jobDescription}`) > 0);
  if (required.length === 1) return required[0];
  const fromResume = stacks
    .map((pack) => ({ pack, score: hits(pack, input.resumeText) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return fromResume[0]?.pack ?? null;
}

/**
 * 备课的题池从哪些包抽主题：岗位对应的领域包（岗位名 + JD 得分最高的 domain 包；全无命中时 cs-fundamentals）、
 * 一个语言栈包（见 stackPackFor）、计算机基础包各一个角色，名额在 topics.ts 里按角色分配，
 * 栈包与基础包只是点缀，不会淹没岗位本身的考点。HR 面只抽行为包。
 */
export function packsForTopics(input: SkillSelectionInput, packs: SkillPack[], round: string | null): TopicPack[] {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  if (round === "hr_interview") return byName.has(HR_PACK) ? [{ pack: byName.get(HR_PACK)!, role: "domain" }] : [];
  const domain =
    packs
      .filter((pack) => pack.layer === "domain")
      .map((pack) => ({ pack, score: hits(pack, input.jobTitle) * TITLE_WEIGHT + hits(pack, input.jobDescription) * JD_WEIGHT }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.pack ??
    byName.get(FALLBACK_DOMAIN) ??
    null;
  if (!domain) return [];
  const picked: TopicPack[] = [{ pack: domain, role: "domain" }];
  const stack = stackPackFor(input, packs);
  if (stack) picked.push({ pack: stack, role: "stack" });
  const basics = byName.get(BASICS_PACK);
  if (basics && basics !== domain) picked.push({ pack: basics, role: "basics" });
  return picked;
}

/** 面试中可查的包：备课时用过的包及其父级领域包，按备课顺序，最多 limit 个。 */
export function packsForInterview(names: string[], packs: SkillPack[], limit = 6): SkillPack[] {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const picked: SkillPack[] = [];
  const push = (pack: SkillPack | undefined) => {
    if (pack && !picked.includes(pack)) picked.push(pack);
  };
  for (const name of names) {
    const pack = byName.get(name);
    if (pack?.parent) push(byName.get(pack.parent));
    push(pack);
  }
  return picked.slice(0, limit);
}

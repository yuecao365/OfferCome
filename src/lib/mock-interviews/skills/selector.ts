import type { SkillPack } from "./types";

/**
 * 技能包的选择。
 *
 * 关键词打分：岗位名最高，JD 次之，简历最低——面试考的是这个岗位，简历只决定栈包与项目；
 * 简历权重高时，后端简历投前端 / 测开 / 运维岗会把后端与 AI 包顶到前面，备课就跟着简历跑偏。
 */

const TITLE_WEIGHT = 3;
const JD_WEIGHT = 2;
const RESUME_WEIGHT = 1;
const MAX_STACK_PACKS = 1;
const FALLBACK_DOMAIN = "cs-fundamentals";
const HR_PACK = "behavioral";

export type SkillSelectionInput = {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
};

function keywordScore(pack: SkillPack, input: SkillSelectionInput): number {
  const resume = input.resumeText.toLowerCase();
  const title = input.jobTitle.toLowerCase();
  const jd = input.jobDescription.toLowerCase();
  let score = 0;
  for (const keyword of pack.keywords) {
    const needle = keyword.toLowerCase();
    if (!needle) continue;
    if (resume.includes(needle)) score += RESUME_WEIGHT;
    if (title.includes(needle)) score += TITLE_WEIGHT;
    if (jd.includes(needle)) score += JD_WEIGHT;
  }
  return score;
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

/**
 * 备课的题池从哪些包抽主题：排第一的是岗位对应的领域包（得分最高的 domain 包；全无命中时 cs-fundamentals），
 * 之后至多一个命中的栈包（连同它的父级领域包）作补充。HR 面只抽行为包。
 * 抽样时领域包的主题加分（topics.ts），栈包的主题不会淹没岗位本身的考点。
 */
export function packsForTopics(input: SkillSelectionInput, packs: SkillPack[], round: string | null): SkillPack[] {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  if (round === "hr_interview") return byName.has(HR_PACK) ? [byName.get(HR_PACK)!] : [];
  const hits = rankSkillPacks(input, packs).filter((pack) => pack.layer !== "base" && keywordScore(pack, input) > 0);
  const primary = hits.find((pack) => pack.layer === "domain") ?? byName.get(FALLBACK_DOMAIN) ?? null;
  const picked: SkillPack[] = primary ? [primary] : [];
  for (const stack of hits.filter((pack) => pack.layer === "stack").slice(0, MAX_STACK_PACKS)) {
    const parent = stack.parent ? byName.get(stack.parent) : null;
    if (parent && !picked.includes(parent)) picked.push(parent);
    picked.push(stack);
  }
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

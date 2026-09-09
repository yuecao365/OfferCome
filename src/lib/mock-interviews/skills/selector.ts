import type { SkillPack } from "./types";

/**
 * 技能包的排序与索引缩小。
 *
 * 关键词打分：岗位名最高，JD 次之，简历最低——面试考的是这个岗位，简历只决定栈包与项目；
 * 简历权重高时，后端简历投前端 / 测开 / 运维岗会把后端与 AI 包顶到前面，备课就跟着简历跑偏
 * （评测里前端 JD 的简报一半加载的是 ai-llm 包）。
 * 这里只决定"索引里放哪些包"，不替 agent 决定加载哪些。
 */

const TITLE_WEIGHT = 3;
const JD_WEIGHT = 2;
const RESUME_WEIGHT = 1;
/** 索引里最多放这么多包；base 层不占名额之外的优先级，永远在前。 */
export const SKILL_INDEX_LIMIT = 12;
const MAX_STACK_PACKS = 2;

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
 * 按相关性排序：base 层固定在前；其余按关键词得分降序，得分为 0 的排在最后
 * （仍然保留，让 agent 有机会纠正关键词没覆盖到的情况）；stack 包总在其父级 domain 包之后。
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

/** 缩小后的索引：排序结果的前 limit 个，且命中为 0 的包只在名额有余时保留。 */
export function selectSkillIndex(
  input: SkillSelectionInput,
  packs: SkillPack[],
  limit = SKILL_INDEX_LIMIT,
): SkillPack[] {
  return rankSkillPacks(input, packs).slice(0, limit);
}

/**
 * 旧的确定性推荐清单（体验版的分步出题仍在用）：base → 一个领域包 → 至多两个栈包，
 * 栈包自动带上父级领域包；全无命中时兜底到 cs-fundamentals。
 */
export function recommendSkillPacks(input: SkillSelectionInput, packs: SkillPack[]): string[] {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const hits = rankSkillPacks(input, packs).filter(
    (pack) => pack.layer !== "base" && keywordScore(pack, input) > 0,
  );

  const domains: string[] = [];
  const stacks: string[] = [];
  for (const pack of hits) {
    if (pack.layer === "stack" && stacks.length < MAX_STACK_PACKS) {
      stacks.push(pack.name);
      if (pack.parent && byName.has(pack.parent) && !domains.includes(pack.parent)) {
        domains.push(pack.parent);
      }
    } else if (pack.layer === "domain" && domains.length === 0 && stacks.length === 0) {
      domains.push(pack.name);
    }
  }
  if (domains.length === 0 && byName.has("cs-fundamentals")) {
    domains.push("cs-fundamentals");
  }

  const base = packs.filter((pack) => pack.layer === "base").map((pack) => pack.name);
  return [...new Set([...base, ...domains, ...stacks])];
}

/** 面试中可查的包：备课时加载过的包及其父级领域包，按备课顺序，最多 limit 个。 */
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

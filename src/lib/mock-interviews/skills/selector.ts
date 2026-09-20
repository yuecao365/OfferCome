import type { SkillPack } from "./types";

/**
 * 技能包的选择（重建 v5 §6）：包是方法书，不是题纲。备课给模型读的包只有三种：
 * 岗位对应的领域包（岗位名 + JD 关键词得分最高的 domain 包；全无命中时 cs-fundamentals）、
 * 语言栈包（只在岗位名或 JD 点名恰好一门语言时；简历用什么语言不决定考什么）、项目深挖方法包。
 * HR 面只读行为包与方法包。
 */

const TITLE_WEIGHT = 3;
const JD_WEIGHT = 2;
const FALLBACK_DOMAIN = "cs-fundamentals";
const HR_PACK = "behavioral";
export const PROJECT_METHOD_PACK = "project-deep-dive";

export type SkillSelectionInput = {
  jobTitle: string;
  jobDescription: string;
};

function hits(pack: SkillPack, text: string): number {
  const haystack = text.toLowerCase();
  return pack.keywords.filter((keyword) => keyword.trim().length > 0 && haystack.includes(keyword.toLowerCase())).length;
}

function jobScore(pack: SkillPack, input: SkillSelectionInput): number {
  return hits(pack, input.jobTitle) * TITLE_WEIGHT + hits(pack, input.jobDescription) * JD_WEIGHT;
}

/** 岗位名或 JD 点名的语言栈：恰好命中一个栈包才算点名；罗列几门"至少一门"或不提时不给。 */
export function stackPackNamedByJob(input: SkillSelectionInput, packs: SkillPack[]): SkillPack | null {
  const named = packs.filter((pack) => pack.layer === "stack" && hits(pack, `${input.jobTitle}\n${input.jobDescription}`) > 0);
  return named.length === 1 ? named[0] : null;
}

/** 备课读的包（按顺序）：领域包、点名的栈包、项目深挖方法包。也是这场面试中可 load_skill 的包。 */
export function packsForPrep(input: SkillSelectionInput, packs: SkillPack[], round: string | null): SkillPack[] {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const method = byName.get(PROJECT_METHOD_PACK);
  const picked: SkillPack[] = [];
  if (round === "hr_interview") {
    const hr = byName.get(HR_PACK);
    if (hr) picked.push(hr);
  } else {
    const domain =
      packs
        .filter((pack) => pack.layer === "domain")
        .map((pack) => ({ pack, score: jobScore(pack, input) }))
        .filter((item) => item.score > 0)
        // 打平按包名，不靠目录加载顺序：此前 test-qa 与 ai-llm 同分时谁排前取决于 readdir。
        .sort((left, right) => right.score - left.score || left.pack.name.localeCompare(right.pack.name))[0]?.pack ?? byName.get(FALLBACK_DOMAIN);
    if (domain) picked.push(domain);
    const stack = stackPackNamedByJob(input, packs);
    if (stack) picked.push(stack);
  }
  if (method) picked.push(method);
  return picked;
}

/** 按名取包（备课记下的名字 → 包，带上父级领域包），面试官回放、评分 agent 都用它；不做任何挑选。 */
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

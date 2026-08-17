import type { SkillPack } from "./types";

/** 简历权重最高，岗位名次之，JD 最低——JD 普遍宽泛过时，只当方向信号。 */
const RESUME_WEIGHT = 3;
const TITLE_WEIGHT = 2;
const JD_WEIGHT = 1;
const MAX_STACK_PACKS = 2;

function keywordScore(
  pack: SkillPack,
  resume: string,
  title: string,
  jd: string,
): number {
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
 * 推荐技能包（agent 自主加载的参考标注 + 弱模型的兜底注入清单）。
 * 返回顺序固定为 base → domain → stack，便于拼接注入。
 */
export function recommendSkillPacks(
  input: { jobTitle: string; jobDescription: string; resumeText: string },
  packs: SkillPack[],
): string[] {
  const resume = input.resumeText.toLowerCase();
  const title = input.jobTitle.toLowerCase();
  const jd = input.jobDescription.toLowerCase();
  const byName = new Map(packs.map((pack) => [pack.name, pack]));

  const scored = packs
    .filter((pack) => pack.layer !== "base")
    .map((pack) => ({ pack, score: keywordScore(pack, resume, title, jd) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const domains: string[] = [];
  const stacks: string[] = [];
  for (const { pack } of scored) {
    if (pack.layer === "stack" && stacks.length < MAX_STACK_PACKS) {
      stacks.push(pack.name);
      // 命中栈包自动上溯父级领域包，架构方法论不缺席。
      if (pack.parent && byName.has(pack.parent) && !domains.includes(pack.parent)) {
        domains.push(pack.parent);
      }
    } else if (pack.layer === "domain" && domains.length === 0 && stacks.length === 0) {
      domains.push(pack.name);
    }
  }
  // 全无命中时兜底到计算机基础，技术岗永远有领域包可用。
  if (domains.length === 0 && byName.has("cs-fundamentals")) {
    domains.push("cs-fundamentals");
  }

  const base = packs
    .filter((pack) => pack.layer === "base")
    .map((pack) => pack.name);
  return [...new Set([...base, ...domains, ...stacks])];
}

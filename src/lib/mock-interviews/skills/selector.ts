import type { SkillPack } from "./types";

/**
 * 技能包按名取用。选包不在这里：规划时模型看着索引自己挑（brief-agent.ts），
 * 读过的包名记进简报的 skillPacks，面试官回放与评分 agent 按名字取同一批包。
 */

export const PROJECT_METHOD_PACK = "project-deep-dive";

export function packsForInterview(names: string[], packs: SkillPack[], limit = 6): SkillPack[] {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  return names.flatMap((name) => byName.get(name) ?? []).filter((pack, index, all) => all.indexOf(pack) === index).slice(0, limit);
}

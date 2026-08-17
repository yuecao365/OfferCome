/**
 * 面试技能包：对齐 Anthropic Agent Skills 规范（skills/<name>/SKILL.md，
 * YAML frontmatter + markdown 正文），三级渐进式披露——
 * name/description 恒在出题 agent 上下文，全文由 agent 通过 load_skill
 * 工具按需加载；弱模型不调工具时由选择器推荐包做确定性兜底注入。
 */
export const SKILL_LAYERS = ["base", "domain", "stack"] as const;

export type SkillLayer = (typeof SKILL_LAYERS)[number];

export function isSkillLayer(value: string): value is SkillLayer {
  return (SKILL_LAYERS as readonly string[]).includes(value);
}

export type SkillPack = {
  /** 小写连字符，与目录名一致，load_skill 的入参。 */
  name: string;
  /** 是什么 + 什么时候用：agent 判断是否加载的唯一依据。 */
  description: string;
  /** 选择器打分用（简历 > 岗位名 > JD）。 */
  keywords: string[];
  layer: SkillLayer;
  /** stack 层必填；加载 stack 包时自动带上 parent 领域包。 */
  parent?: string;
  /** markdown 正文（不含 frontmatter）。 */
  body: string;
};

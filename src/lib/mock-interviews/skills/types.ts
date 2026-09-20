/**
 * 面试技能包：对齐 Anthropic Agent Skills 规范（skills/<name>/SKILL.md，YAML frontmatter + markdown 正文），两级渐进式披露——
 * base / domain 包的索引（name / description / keywords）在规划卡里，模型自己挑并用 load_skill 读全文；
 * detail 包（一个主题簇的深挖）不进索引，由代码列在它所属的每个 domain 包正文末尾，模型读完领域包再按需读。
 * 一个 detail 包可以属于多个 domain（Python 同时属于后端、Agent、算法、Infra）。代码不替模型选包。
 */
const SKILL_LAYERS = ["base", "domain", "detail"] as const;

export type SkillLayer = (typeof SKILL_LAYERS)[number];

export function isSkillLayer(value: string): value is SkillLayer {
  return (SKILL_LAYERS as readonly string[]).includes(value);
}

export type SkillPack = {
  /** 小写连字符，与目录名一致，load_skill 的入参。 */
  name: string;
  /** 是什么 + 什么时候用：agent 判断是否加载的唯一依据。 */
  description: string;
  /** 索引里给模型看的匹配线索：岗位名、技术词。 */
  keywords: string[];
  layer: SkillLayer;
  /** detail 层必填且非空：列在哪些 domain 包末尾。base / domain 为空数组。 */
  domains: string[];
  /** markdown 正文（不含 frontmatter）。 */
  body: string;
};

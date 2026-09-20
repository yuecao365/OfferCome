import { tool } from "ai";

import type { LoopToolSet } from "@/lib/ai/agent-loop";
import { z } from "zod";

import type { SkillPack } from "./types";

/**
 * 技能包的渐进式披露（Agent Skills），两级：
 * 规划卡的索引只列 base + domain 包，全文由 agent 调用 load_skill 自行加载；
 * 领域包正文末尾由代码拼上属于它的细节包索引，模型读完领域包才看到、按需再读。代码不替 agent 选包、不截片段。
 */

/** 给提示词看的索引：一行一个包；规划时带 keywords 帮模型对上岗位。 */
export function renderSkillIndex(packs: SkillPack[], options: { keywords?: boolean } = {}): string {
  return packs
    .map((pack) => `- ${pack.name}（${pack.layer}）：${pack.description}${options.keywords && pack.keywords.length > 0 ? `（关键词：${pack.keywords.join("、")}）` : ""}`)
    .join("\n");
}

export type SkillTools = {
  tools: LoopToolSet;
  /** 按加载顺序登记的包名。 */
  loaded: string[];
};

/** 加载一个包时模型看到的文本：领域包末尾带上属于它的细节包索引。 */
export function loadSkillText(name: string, packs: SkillPack[]): string {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const pack = byName.get(name);
  if (!pack) return `技能包 ${name} 不存在。可用：${[...byName.keys()].join(", ")}`;
  return `### 技能包：${pack.name}\n${pack.body}${renderDetailSection(pack, packs)}`;
}

/** 领域包正文末尾的下一级披露：属于它的细节包。没有的不加。 */
function renderDetailSection(pack: SkillPack, packs: SkillPack[]): string {
  const details = packs.filter((item) => item.layer === "detail" && item.domains.includes(pack.name));
  if (details.length === 0) return "";
  return `\n\n## 可选的细节包\n\n下面是这个方向可以深挖的主题簇，各自一本；JD 点名、简历项目落在上面、或这场要往那个方向深追时，再用 load_skill 读一到两本，不点名不读。\n${details.map((item) => `- ${item.name}：${item.description}`).join("\n")}`;
}

export function createSkillTools(packs: SkillPack[]): SkillTools {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const loaded: string[] = [];

  const load_skill = {
    access: "read" as const,
    ...tool({
    description:
      "加载一个面试技能包的全文（这个方向的面试官在意什么、项目 / 实习怎么深挖、常见失守与危险信号、常考主题清单与阶梯）。它是\"问到哪一层算实\"的参考，不是题库；已加载过的不必重复加载。",
    inputSchema: z.object({ name: z.string().min(1).max(64) }),
    execute: async ({ name }) => {
      const pack = byName.get(name);
      if (pack && !loaded.includes(pack.name)) loaded.push(pack.name);
      return loadSkillText(name, packs);
    },
  }),
  };

  return { tools: { load_skill }, loaded };
}

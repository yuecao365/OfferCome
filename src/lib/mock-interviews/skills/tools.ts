import { tool } from "ai";

import type { LoopToolSet } from "@/lib/ai/agent-loop";
import { z } from "zod";

import type { SkillPack } from "./types";

/**
 * 技能包的渐进式披露（Agent Skills）：
 * 索引（name + description）常驻提示词，全文由 agent 调用 load_skill 自行加载。
 * 代码不替 agent 选内容、不截片段；只在包多时缩小索引（见 selector）。
 */

/** 给提示词看的索引：一行一个包。 */
export function renderSkillIndex(packs: SkillPack[]): string {
  return packs
    .map((pack) => `- ${pack.name}（${pack.layer}${pack.parent ? `，属于 ${pack.parent}` : ""}）：${pack.description}`)
    .join("\n");
}

export type SkillTools = {
  tools: LoopToolSet;
  /** 按加载顺序登记的包名（含自动带上的父级领域包）。 */
  loaded: string[];
};

/**
 * load_skill 工具。加载 stack 包时自动附带其父级 domain 包，架构方法论不缺席。
 * 返回值就是包的正文，agent 读完自己决定要不要再加载别的。
 */
/** 加载一个包时模型看到的文本：stack 包自动带上父级。规划回放（planningHead）与 load_skill 共用，保证两处逐字一致。 */
export function loadSkillText(name: string, packs: SkillPack[]): string {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const pack = byName.get(name);
  if (!pack) return `技能包 ${name} 不存在。可用：${[...byName.keys()].join(", ")}`;
  const render = (item: SkillPack) => `### 技能包：${item.name}\n${item.body}`;
  const parent = pack.parent ? byName.get(pack.parent) : null;
  return [...(parent ? [render(parent)] : []), render(pack)].join("\n\n");
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
      if (pack) {
        if (pack.parent && !loaded.includes(pack.parent)) loaded.push(pack.parent);
        if (!loaded.includes(pack.name)) loaded.push(pack.name);
      }
      return loadSkillText(name, packs);
    },
  }),
  };

  return { tools: { load_skill }, loaded };
}

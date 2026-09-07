import { tool, type ToolSet } from "ai";
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
  tools: ToolSet;
  /** 按加载顺序登记的包名（含自动带上的父级领域包）。 */
  loaded: string[];
};

/**
 * load_skill 工具。加载 stack 包时自动附带其父级 domain 包，架构方法论不缺席。
 * 返回值就是包的正文，agent 读完自己决定要不要再加载别的。
 */
export function createSkillTools(packs: SkillPack[]): SkillTools {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const loaded: string[] = [];
  const render = (pack: SkillPack) => `### 技能包：${pack.name}\n${pack.body}`;

  const load_skill = tool({
    description:
      "加载一个面试技能包的全文（岗位职责与考察重点、主题与深度阶梯、好题坏题、项目结合钩子）。按索引里的 description 判断相关性，备课前先加载最相关的 1–3 个包；已加载过的不必重复加载。",
    inputSchema: z.object({ name: z.string().min(1).max(64) }),
    execute: async ({ name }) => {
      const pack = byName.get(name);
      if (!pack) {
        return `技能包 ${name} 不存在。可用：${[...byName.keys()].join(", ")}`;
      }
      const parts: string[] = [];
      const parent = pack.parent ? byName.get(pack.parent) : null;
      if (parent && !loaded.includes(parent.name)) {
        loaded.push(parent.name);
        parts.push(render(parent));
      }
      if (!loaded.includes(pack.name)) loaded.push(pack.name);
      parts.push(render(pack));
      return parts.join("\n\n");
    },
  });

  return { tools: { load_skill }, loaded };
}

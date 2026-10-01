import { tool } from "ai";

import type { LoopToolSet } from "@/lib/ai/agent-loop";
import type { ContentLanguage } from "@/lib/i18n/locale";
import { z } from "zod";

import type { SkillPack } from "./types";

/**
 * 技能包的渐进式披露（Agent Skills），两级：
 * 规划卡的索引只列 base + domain 包，全文由 agent 调用 load_skill 自行加载；
 * 领域包正文末尾由代码拼上属于它的细节包索引，模型读完领域包才看到、按需再读。代码不替 agent 选包、不截片段。
 * 包外面这层框架文字（索引行、包头、细节包说明、工具描述）按面试语言给；包正文由 loadSkillPacks(language) 取对应语言的文件。
 */
const COPY = {
  zh: {
    indexLine: (pack: SkillPack, keywords: string) => `- ${pack.name}（${pack.layer}）：${pack.description}${keywords ? `（关键词：${keywords}）` : ""}`,
    keywordSeparator: "、",
    missing: (name: string, available: string) => `技能包 ${name} 不存在。可用：${available}`,
    header: (name: string) => `### 技能包：${name}`,
    details: "\n\n## 可选的细节包\n\n下面是这个方向可以深挖的主题簇，各自一本；JD 点名、简历项目落在上面、或这场要往那个方向深追时，再用 load_skill 读一到两本，不点名不读。\n",
    detailLine: (pack: SkillPack) => `- ${pack.name}：${pack.description}`,
    toolDescription:
      "加载一个面试技能包的全文（这个方向的面试官在意什么、项目 / 实习怎么深挖、常见失守与危险信号、常考主题清单与阶梯）。它是\"问到哪一层算实\"的参考，不是题库；已加载过的不必重复加载。",
  },
  en: {
    indexLine: (pack: SkillPack, keywords: string) => `- ${pack.name} (${pack.layer}): ${pack.description}${keywords ? ` (keywords: ${keywords})` : ""}`,
    keywordSeparator: ", ",
    missing: (name: string, available: string) => `Skill pack ${name} doesn't exist. Available: ${available}`,
    header: (name: string) => `### Skill pack: ${name}`,
    details: "\n\n## Optional detail packs\n\nThese are topic clusters you can go deeper on in this area, one pack each. Read one or two with load_skill only when the JD names them, a resume project sits on them, or this interview is going to dig in that direction; otherwise skip them.\n",
    detailLine: (pack: SkillPack) => `- ${pack.name}: ${pack.description}`,
    toolDescription:
      "Load the full text of an interview skill pack (what interviewers in this area care about, how to probe projects and internships, common failures and red flags, frequently tested topics with their ladders). It's a reference for how deep an answer has to go to count as solid, not a question bank; don't reload a pack you already have.",
  },
} satisfies Record<ContentLanguage, unknown>;

/** 给提示词看的索引：一行一个包；规划时带 keywords 帮模型对上岗位。 */
export function renderSkillIndex(packs: SkillPack[], options: { keywords?: boolean; language?: ContentLanguage } = {}): string {
  const copy = COPY[options.language ?? "zh"];
  return packs
    .map((pack) => copy.indexLine(pack, options.keywords && pack.keywords.length > 0 ? pack.keywords.join(copy.keywordSeparator) : ""))
    .join("\n");
}

export type SkillTools = {
  tools: LoopToolSet;
  /** 按加载顺序登记的包名。 */
  loaded: string[];
};

/** 加载一个包时模型看到的文本：领域包末尾带上属于它的细节包索引。 */
export function loadSkillText(name: string, packs: SkillPack[], language: ContentLanguage = "zh"): string {
  const copy = COPY[language];
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const pack = byName.get(name);
  if (!pack) return copy.missing(name, [...byName.keys()].join(", "));
  return `${copy.header(pack.name)}\n${pack.body}${renderDetailSection(pack, packs, language)}`;
}

/** 领域包正文末尾的下一级披露：属于它的细节包。没有的不加。 */
function renderDetailSection(pack: SkillPack, packs: SkillPack[], language: ContentLanguage): string {
  const copy = COPY[language];
  const details = packs.filter((item) => item.layer === "detail" && item.domains.includes(pack.name));
  if (details.length === 0) return "";
  return `${copy.details}${details.map(copy.detailLine).join("\n")}`;
}

export function createSkillTools(packs: SkillPack[], language: ContentLanguage = "zh"): SkillTools {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const loaded: string[] = [];

  const load_skill = {
    access: "read" as const,
    ...tool({
    description: COPY[language].toolDescription,
    inputSchema: z.object({ name: z.string().min(1).max(64) }),
    execute: async ({ name }) => {
      const pack = byName.get(name);
      if (pack && !loaded.includes(pack.name)) loaded.push(pack.name);
      return loadSkillText(name, packs, language);
    },
  }),
  };

  return { tools: { load_skill }, loaded };
}

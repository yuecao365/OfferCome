import type { ContentLanguage } from "@/lib/i18n/locale";

import type { SkillPack } from "./types";

/**
 * 方法书的四段（重建 v5 §6）：面试官在意什么 / 项目 / 实习怎么深挖 / 常见失守与危险信号 / 常考主题清单。
 * 备课按段引用；面试中由 load_skill 给全文。英文包（SKILL.en.md）用逐字对齐的英文标题与阶梯前缀。
 */
export const SKILL_SECTIONS = {
  cares: "面试官在意什么",
  projects: "项目 / 实习怎么深挖",
  redFlags: "常见失守与危险信号",
  topics: "常考主题清单",
} as const;
export type SkillSectionKey = keyof typeof SKILL_SECTIONS;

const SKILL_SECTIONS_EN: Record<SkillSectionKey, string> = {
  cares: "What interviewers care about",
  projects: "Probing projects and internships",
  redFlags: "Common failures and red flags",
  topics: "Frequently tested topics",
};
const LADDER_PREFIX: Record<ContentLanguage, RegExp> = { zh: /^- 阶梯：(.*)$/, en: /^- Ladder:\s*(.*)$/ };

/** 包正文是哪种语言：看有没有英文标题。 */
export function packLanguage(pack: SkillPack): ContentLanguage {
  return pack.body.includes(`## ${SKILL_SECTIONS_EN.cares}`) ? "en" : "zh";
}

/** 按包的语言取某一段的标题。 */
export function skillSectionHeading(pack: SkillPack, key: SkillSectionKey): string {
  return packLanguage(pack) === "en" ? SKILL_SECTIONS_EN[key] : SKILL_SECTIONS[key];
}

/** 包正文里某个二级标题下的整段（不含标题），没有时为空串。 */
export function skillSection(pack: SkillPack, heading: string): string {
  const lines = pack.body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return rest.slice(0, end < 0 ? undefined : end).join("\n").trim();
}

/** 常考主题清单里的主题名（### 标题），按出现顺序；兜底简报的基础题名从这里取。 */
export function topicNames(pack: SkillPack): string[] {
  return skillSection(pack, skillSectionHeading(pack, "topics"))
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^### (.+?)\s*$/);
      return match ? [match[1]] : [];
    });
}

/** 主题清单压成一行一个"名字：阶梯"，给备课当参考（不是配额）。 */
export function topicOutline(pack: SkillPack): string {
  const language = packLanguage(pack);
  const lines = skillSection(pack, skillSectionHeading(pack, "topics")).split(/\r?\n/);
  const out: string[] = [];
  let name: string | null = null;
  for (const line of lines) {
    const heading = line.match(/^### (.+?)\s*$/);
    if (heading) {
      name = heading[1];
      continue;
    }
    const ladder = name ? line.match(LADDER_PREFIX[language]) : null;
    if (ladder) out.push(language === "en" ? `- ${name}: ${ladder[1].trim()}` : `- ${name}：${ladder[1].trim()}`);
  }
  return out.join("\n");
}

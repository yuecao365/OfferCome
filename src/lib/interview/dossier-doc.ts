import type { ContentLanguage } from "@/lib/i18n/locale";

/**
 * 候选人档案（深度扩展 G4）：同一份简历跨场的、agent 可读写的文件式记忆。
 * 一份 Markdown 文档，固定几个段落，每场结束由档案 agent 整份重写并记一句"改了什么"，带版本号；
 * 下一场备课（写假设）、面试官（系统提示里的摘录）、评分（recall 工具按关键词查）只读它。
 * 这里是纯函数：模板、规范化（段落齐全、长度封顶）、给面试官的摘录、快照里的读法。
 * 段落是语言中立的键（docs/i18n-plan.md §3）：档案按最近一场的语言整份重写，解析两种语言的标题都认。
 */

export const DOSSIER_KEYS = ["verified", "unclear", "recurringWeaknesses", "anglesAsked", "sessions"] as const;
export type DossierKey = (typeof DOSSIER_KEYS)[number];

/** 每种语言的标题、五段段名、空段占位。 */
export const DOSSIER_HEADINGS: Record<ContentLanguage, { title: string; sections: Record<DossierKey, string>; empty: string }> = {
  zh: {
    title: "# 候选人档案",
    sections: { verified: "已验证的说法", unclear: "没讲清的说法", recurringWeaknesses: "反复出现的短板", anglesAsked: "问过的项目角度", sessions: "场次记录" },
    empty: "（无）",
  },
  en: {
    title: "# Candidate dossier",
    sections: { verified: "Verified claims", unclear: "Claims not yet backed up", recurringWeaknesses: "Recurring weaknesses", anglesAsked: "Project angles already asked", sessions: "Session log" },
    empty: "(none)",
  },
};

/** 总长上限：英文同样内容约两倍字符。 */
export const DOSSIER_MAX_CHARS: Record<ContentLanguage, number> = { zh: 4_000, en: 8_000 };
/** 每段最多这么多条：G4 冒烟第三版就撞了总长上限（同一天的条目没合并），封顶会先截掉最后几段。多出的条从后面丢，所以提示词要求重要的、最近的排前面。 */
export const DOSSIER_SECTION_MAX_LINES = 10;
/** 面试官系统提示里只放前三段的摘录：决定追什么，不当面复述。 */
export const DOSSIER_EXCERPT_CHARS: Record<ContentLanguage, number> = { zh: 1_200, en: 2_400 };

const KEY_OF_HEADING = new Map<string, DossierKey>(
  Object.values(DOSSIER_HEADINGS).flatMap((headings) => DOSSIER_KEYS.map((key) => [headings.sections[key].toLowerCase(), key] as const)),
);
const EMPTY_MARKERS = new Set(Object.values(DOSSIER_HEADINGS).map((headings) => headings.empty));

export type StoredDossier = { version: number; body: string };

export function emptyDossier(language: ContentLanguage = "zh"): string {
  const headings = DOSSIER_HEADINGS[language];
  return `${headings.title}\n\n${DOSSIER_KEYS.map((key) => `## ${headings.sections[key]}\n${headings.empty}`).join("\n\n")}`;
}

/** 把文档切成段：标题行之后按 "## 段名" 分（两种语言的段名都认），段名不在固定集合里的丢掉。 */
export function dossierSections(body: string): Map<DossierKey, string> {
  const sections = new Map<DossierKey, string>();
  let current: DossierKey | null = null;
  const buffer: string[] = [];
  const flush = () => {
    if (current) sections.set(current, buffer.join("\n").trim());
    buffer.length = 0;
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flush();
      current = KEY_OF_HEADING.get(heading[1].toLowerCase()) ?? null;
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return sections;
}

/** 一段最多保留前 N 条（条 = 以 - 开头的行），其余行照旧。 */
function capSection(text: string): string {
  let kept = 0;
  return text
    .split("\n")
    .filter((line) => {
      if (!/^\s*[-*]\s/.test(line)) return true;
      kept += 1;
      return kept <= DOSSIER_SECTION_MAX_LINES;
    })
    .join("\n")
    .trim();
}

/** 规范化：固定标题、段落齐全（缺的补空段占位）、顺序固定、每段封顶条数、总长封顶；标题按 language 写。模型写偏的段名或多写的段落不进档案。 */
export function normalizeDossier(body: string, language: ContentLanguage = "zh"): string {
  const headings = DOSSIER_HEADINGS[language];
  const sections = dossierSections(body);
  const rendered = DOSSIER_KEYS.map((key) => {
    const text = capSection(sections.get(key) ?? "");
    return `## ${headings.sections[key]}\n${text && !EMPTY_MARKERS.has(text) ? text : headings.empty}`;
  }).join("\n\n");
  return `${headings.title}\n\n${rendered}`.slice(0, DOSSIER_MAX_CHARS[language]);
}

/** 给面试官看的摘录：已验证 / 没讲清 / 反复出现的短板三段，封顶；段名按面试语言写。 */
export function dossierExcerpt(body: string, maxChars?: number, language: ContentLanguage = "zh"): string {
  const headings = DOSSIER_HEADINGS[language];
  const separator = language === "en" ? ":" : "：";
  const sections = dossierSections(body);
  const parts = DOSSIER_KEYS.slice(0, 3).flatMap((key) => {
    const text = sections.get(key);
    return text && !EMPTY_MARKERS.has(text) ? [`${headings.sections[key]}${separator}\n${text}`] : [];
  });
  return parts.join("\n").slice(0, maxChars ?? DOSSIER_EXCERPT_CHARS[language]);
}

/** 会话快照里的档案（备课时存进去，可重放）；没有为 null。 */
export function dossierOf(contextSnapshotJson: string | null | undefined): StoredDossier | null {
  try {
    const parsed = JSON.parse(contextSnapshotJson ?? "{}") as { dossier?: { version?: unknown; body?: unknown } | null };
    const dossier = parsed.dossier;
    if (!dossier || typeof dossier !== "object" || typeof dossier.body !== "string" || !dossier.body.trim()) return null;
    return { version: typeof dossier.version === "number" ? dossier.version : 0, body: dossier.body };
  } catch {
    return null;
  }
}

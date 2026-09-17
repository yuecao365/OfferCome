/**
 * 候选人档案（深度扩展 G4）：同一份简历跨场的、agent 可读写的文件式记忆。
 * 一份 Markdown 文档，固定几个段落，每场结束由档案 agent 整份重写并记一句"改了什么"，带版本号；
 * 下一场备课（写假设）、面试官（系统提示里的摘录）、评分（recall 工具按关键词查）只读它。
 * 这里是纯函数：模板、规范化（段落齐全、长度封顶）、给面试官的摘录、快照里的读法。
 */

export const DOSSIER_TITLE = "# 候选人档案";
export const DOSSIER_SECTIONS = ["已验证的说法", "没讲清的说法", "反复出现的短板", "问过的项目角度", "场次记录"] as const;
export const DOSSIER_MAX_CHARS = 4_000;
/** 每段最多这么多条：G4 冒烟第三版就撞了总长上限（同一天的条目没合并），封顶会先截掉最后几段。多出的条从后面丢，所以提示词要求重要的、最近的排前面。 */
export const DOSSIER_SECTION_MAX_LINES = 10;
/** 面试官系统提示里只放前三段的摘录：决定追什么，不当面复述。 */
export const DOSSIER_EXCERPT_CHARS = 1_200;
const EMPTY_SECTION = "（无）";

export type StoredDossier = { version: number; body: string };

export function emptyDossier(): string {
  return `${DOSSIER_TITLE}\n\n${DOSSIER_SECTIONS.map((section) => `## ${section}\n${EMPTY_SECTION}`).join("\n\n")}`;
}

/** 把文档切成段：标题行之后按 "## 段名" 分，段名不在固定集合里的丢掉。 */
export function dossierSections(body: string): Map<(typeof DOSSIER_SECTIONS)[number], string> {
  const sections = new Map<(typeof DOSSIER_SECTIONS)[number], string>();
  const known = new Set<string>(DOSSIER_SECTIONS);
  let current: (typeof DOSSIER_SECTIONS)[number] | null = null;
  const buffer: string[] = [];
  const flush = () => {
    if (current) sections.set(current, buffer.join("\n").trim());
    buffer.length = 0;
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flush();
      current = known.has(heading[1]) ? (heading[1] as (typeof DOSSIER_SECTIONS)[number]) : null;
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

/** 规范化：固定标题、段落齐全（缺的补"（无）"）、顺序固定、每段封顶条数、总长封顶。模型写偏的段名或多写的段落不进档案。 */
export function normalizeDossier(body: string): string {
  const sections = dossierSections(body);
  const rendered = DOSSIER_SECTIONS.map((section) => `## ${section}\n${capSection(sections.get(section) ?? "") || EMPTY_SECTION}`).join("\n\n");
  return `${DOSSIER_TITLE}\n\n${rendered}`.slice(0, DOSSIER_MAX_CHARS);
}

/** 给面试官看的摘录：已验证 / 没讲清 / 反复出现的短板三段，封顶。 */
export function dossierExcerpt(body: string, maxChars = DOSSIER_EXCERPT_CHARS): string {
  const sections = dossierSections(body);
  const parts = DOSSIER_SECTIONS.slice(0, 3).flatMap((section) => {
    const text = sections.get(section);
    return text && text !== EMPTY_SECTION ? [`${section}：\n${text}`] : [];
  });
  return parts.join("\n").slice(0, maxChars);
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

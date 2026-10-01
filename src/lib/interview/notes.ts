import type { ContentLanguage } from "@/lib/i18n/locale";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { planMaterials } from "./progress";

/**
 * 面试笔记（场内记忆，agent-freedom-plan §2.8）：面试官每回合整份重写的一份 Markdown，四段固定标题。
 * 代码只做三件事：开场按备课产物预填、交笔记时守格式（标题齐、编号的假设不丢、不超长）、从"待验证"段数出还剩几条。
 * 与跨场的候选人档案（dossier-doc.ts）同一套做法：固定段落、整份重写、条目只移动不消失。
 * 段落是语言中立的键（docs/i18n-plan.md §3）：标题按场次语言写，解析两种语言的标题都认（旧场次照读）。
 */

export const NOTE_KEYS = ["pending", "concluded", "doubtful", "next"] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];

/** 每种语言的四段标题（写进提示词、预填笔记、退回原因）。 */
export const NOTE_HEADINGS: Record<ContentLanguage, Record<NoteKey, string>> = {
  zh: { pending: "待验证", concluded: "已有结论", doubtful: "存疑", next: "接下来" },
  en: { pending: "To verify", concluded: "Concluded", doubtful: "Doubtful", next: "Next" },
};

/** 笔记上限：超过退回让模型压缩；第二次放行。冒烟里模型自然写到 800–860 字，定 1200 留余量；英文同样内容约两倍字符。 */
export const NOTES_MAX_CHARS: Record<ContentLanguage, number> = { zh: 1200, en: 2400 };

const HEADING = /^##\s*(.+?)\s*$/;
const ID_TAG = /\[([A-Za-z0-9_-]+)\]/g;

/** 标题文字 → 段落键：两种语言都认，英文不分大小写。 */
const KEY_OF_HEADING = new Map<string, NoteKey>(
  (Object.values(NOTE_HEADINGS) as Record<NoteKey, string>[]).flatMap((headings) => NOTE_KEYS.map((key) => [headings[key].toLowerCase(), key] as const)),
);

/** 四段标题拼成一行（"## 待验证 / ## 已有结论 / …"）：提示词与工具说明用。 */
export function noteHeadingLine(language: ContentLanguage): string {
  return NOTE_KEYS.map((key) => `## ${NOTE_HEADINGS[language][key]}`).join(" / ");
}

/** 按标题切段；未知标题下的内容归到它前面的段。 */
export function noteSections(notes: string): Map<NoteKey, string> {
  const sections = new Map<NoteKey, string>();
  let current: NoteKey | null = null;
  const buffers = new Map<NoteKey, string[]>();
  for (const raw of notes.split(/\r?\n/)) {
    const heading = raw.match(HEADING);
    const key = heading ? KEY_OF_HEADING.get(heading[1].toLowerCase()) : undefined;
    if (key) {
      current = key;
      if (!buffers.has(current)) buffers.set(current, []);
      continue;
    }
    if (current) buffers.get(current)!.push(raw);
  }
  for (const [section, lines] of buffers) sections.set(section, lines.join("\n").trim());
  return sections;
}

/** 一段里的条目（以 - 开头的行）。 */
export function noteItems(section: string | undefined): string[] {
  return (section ?? "").split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[-*]\s+\S/.test(line)).map((line) => line.replace(/^[-*]\s+/, ""));
}

/** "待验证"段还剩几条：探索深度的量化替身（状态卡上给模型看，评测里当指标）。 */
export function pendingCount(notes: string): number {
  return noteItems(noteSections(notes).get("pending")).length;
}

/** "待验证"段里还剩几条属于这些编号（岗位要求的待验数：JD 是岗位特异性的唯一来源，收尾前它得清空）。 */
export function pendingAmong(notes: string, ids: string[]): number {
  const pending = hypothesisIdsIn(noteSections(notes).get("pending") ?? "");
  return ids.filter((id) => pending.has(id)).length;
}

/** 笔记里出现过的 [id]。 */
export function hypothesisIdsIn(notes: string): Set<string> {
  return new Set([...notes.matchAll(ID_TAG)].map((match) => match[1]));
}

const INITIAL_COPY: Record<ContentLanguage, { jdPrefix: string; project: (name: string) => string; noHypotheses: string; none: string; firstMain: (id: string, name: string) => string; followAgenda: string }> = {
  zh: {
    jdPrefix: "岗位要求：",
    project: (name) => `（${name}）`,
    noHypotheses: "（备课没有提出要验证的说法）",
    none: "（还没有）",
    firstMain: (id, name) => `- 先聊主线材料 ${id}「${name}」`,
    followAgenda: "- 按议程开始",
  },
  en: {
    jdPrefix: "Role requirement: ",
    project: (name) => ` (${name})`,
    noHypotheses: "(prep raised no claims to verify)",
    none: "(nothing yet)",
    firstMain: (id, name) => `- Start with main-track item ${id} "${name}"`,
    followAgenda: "- Start with the agenda",
  },
};

/** 开场预填：待验证 = 备课的假设（带编号）；接下来 = 先聊第一份主线材料。 */
export function initialNotes(brief: Pick<InterviewBrief, "pace" | "areas"> & { hypotheses?: InterviewBrief["hypotheses"]; language?: ContentLanguage }): string {
  const language = brief.language ?? "zh";
  const copy = INITIAL_COPY[language];
  const headings = NOTE_HEADINGS[language];
  const names = new Map(brief.areas.map((area) => [area.id, area.name]));
  const pending = (brief.hypotheses ?? []).map((item) => `- [${item.id}] ${item.source === "jd" ? copy.jdPrefix : ""}${item.text}${item.projectId ? copy.project(names.get(item.projectId) ?? item.projectId) : ""}`);
  const first = planMaterials(brief).find((item) => item.lane === "main");
  return [
    `## ${headings.pending}`,
    pending.length > 0 ? pending.join("\n") : copy.noHypotheses,
    "",
    `## ${headings.concluded}`,
    copy.none,
    "",
    `## ${headings.doubtful}`,
    copy.none,
    "",
    `## ${headings.next}`,
    first ? copy.firstMain(first.id, names.get(first.id) ?? first.id) : copy.followAgenda,
  ].join("\n");
}

const VERDICT_COPY: Record<ContentLanguage, { missing: (headings: string[]) => string; lost: (ids: string[]) => string; copied: (ids: string[], pending: string, concluded: string) => string; tooLong: (length: number, max: number, concluded: string, doubtful: string) => string }> = {
  zh: {
    missing: (headings) => `笔记缺少段落：${headings.join("、")}。四段固定标题都要有，整份重写`,
    lost: (ids) => `笔记里 ${ids.join("、")} 不见了：编号的条目只能在段落间移动（验证成立、被推翻、给不出都写进"已有结论"），不能删`,
    copied: (ids, pending, concluded) => `${ids.join("、")} 同时在"${pending}"和"${concluded}"里：有结论了就从"${pending}"移走，不要两处都留`,
    tooLong: (length, max, concluded, doubtful) => `笔记 ${length} 字，超过 ${max} 字：压缩"${concluded}"与"${doubtful}"，一条一行`,
  },
  en: {
    missing: (headings) => `Your notes are missing sections: ${headings.join(", ")}. All four fixed headings are required; rewrite the whole thing`,
    lost: (ids) => `${ids.join(", ")} disappeared from your notes: numbered items may only move between sections (confirmed, refuted or couldn't answer all go under "Concluded"); they can't be deleted`,
    copied: (ids, pending, concluded) => `${ids.join(", ")} appear under both "${pending}" and "${concluded}": once there's a conclusion, move it out of "${pending}" instead of keeping it in both`,
    tooLong: (length, max, concluded, doubtful) => `Your notes are ${length} characters, over the ${max} limit: tighten "${concluded}" and "${doubtful}", one item per line`,
  },
};

/** 交笔记时的格式门：标题齐、备课假设的编号都还在且只在一段里（移动不是复制，否则"待验证还剩几条"失真）、不超长。不过返回退回原因；退回一次，第二次放行（turn.ts）。 */
export function notesVerdict(notes: string, hypothesisIds: string[], language: ContentLanguage = "zh"): string | null {
  const copy = VERDICT_COPY[language];
  const headings = NOTE_HEADINGS[language];
  const sections = noteSections(notes);
  const missing = NOTE_KEYS.filter((key) => !sections.has(key));
  if (missing.length > 0) return copy.missing(missing.map((key) => `## ${headings[key]}`));
  const present = hypothesisIdsIn(notes);
  const lost = hypothesisIds.filter((id) => !present.has(id));
  if (lost.length > 0) return copy.lost(lost.map((id) => `[${id}]`));
  const pending = hypothesisIdsIn(sections.get("pending") ?? "");
  const concluded = hypothesisIdsIn(sections.get("concluded") ?? "");
  const copied = hypothesisIds.filter((id) => pending.has(id) && concluded.has(id));
  if (copied.length > 0) return copy.copied(copied.map((id) => `[${id}]`), headings.pending, headings.concluded);
  const max = NOTES_MAX_CHARS[language];
  if (notes.length > max) return copy.tooLong(notes.length, max, headings.concluded, headings.doubtful);
  return null;
}

/** "接下来"段的第一条：报告页"面试官是怎么问你的"用它当这一步的理由。 */
export function nextStepOf(notes: string): string | null {
  return noteItems(noteSections(notes).get("next"))[0] ?? null;
}

/** 这回合新记下的结论与存疑（相对上一版笔记）：报告页点亮"面试官记了存疑"用。 */
export function newlyNoted(previous: string | null, notes: string): string[] {
  const before = previous ? noteSections(previous) : new Map<NoteKey, string>();
  const after = noteSections(notes);
  const seen = new Set([...noteItems(before.get("concluded")), ...noteItems(before.get("doubtful"))]);
  return [...noteItems(after.get("concluded")), ...noteItems(after.get("doubtful"))].filter((item) => !seen.has(item));
}

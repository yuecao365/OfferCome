import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { planMaterials } from "./progress";

/**
 * 面试笔记（场内记忆，agent-freedom-plan §2.8）：面试官每回合整份重写的一份 Markdown，四段固定标题。
 * 代码只做三件事：开场按备课产物预填、交笔记时守格式（标题齐、编号的假设不丢、不超长）、从"待验证"段数出还剩几条。
 * 与跨场的候选人档案（dossier-doc.ts）同一套做法：固定段落、整份重写、条目只移动不消失。
 */

export const NOTE_SECTIONS = ["待验证", "已有结论", "存疑", "接下来"] as const;
export type NoteSection = (typeof NOTE_SECTIONS)[number];
/** 笔记上限：超过退回让模型压缩；第二次放行。冒烟里模型自然写到 800–860 字，定 1200 留余量。 */
export const NOTES_MAX_CHARS = 1200;

const HEADING = /^##\s*(.+?)\s*$/;
const ID_TAG = /\[([A-Za-z0-9_-]+)\]/g;

/** 按标题切段；未知标题下的内容归到它前面的段。 */
export function noteSections(notes: string): Map<NoteSection, string> {
  const sections = new Map<NoteSection, string>();
  const known = new Set<string>(NOTE_SECTIONS);
  let current: NoteSection | null = null;
  const buffers = new Map<NoteSection, string[]>();
  for (const raw of notes.split(/\r?\n/)) {
    const heading = raw.match(HEADING);
    if (heading && known.has(heading[1])) {
      current = heading[1] as NoteSection;
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
  return noteItems(noteSections(notes).get("待验证")).length;
}

/** "待验证"段里还剩几条属于这些编号（岗位要求的待验数：JD 是岗位特异性的唯一来源，收尾前它得清空）。 */
export function pendingAmong(notes: string, ids: string[]): number {
  const pending = hypothesisIdsIn(noteSections(notes).get("待验证") ?? "");
  return ids.filter((id) => pending.has(id)).length;
}

/** 笔记里出现过的 [id]。 */
export function hypothesisIdsIn(notes: string): Set<string> {
  return new Set([...notes.matchAll(ID_TAG)].map((match) => match[1]));
}

/** 开场预填：待验证 = 备课的假设（带编号）；接下来 = 先聊第一份主线材料。 */
export function initialNotes(brief: Pick<InterviewBrief, "pace" | "areas"> & { hypotheses?: InterviewBrief["hypotheses"] }): string {
  const names = new Map(brief.areas.map((area) => [area.id, area.name]));
  const pending = (brief.hypotheses ?? []).map((item) => `- [${item.id}] ${item.source === "jd" ? "岗位要求：" : ""}${item.text}${item.projectId ? `（${names.get(item.projectId) ?? item.projectId}）` : ""}`);
  const first = planMaterials(brief).find((item) => item.lane === "main");
  return [
    "## 待验证",
    pending.length > 0 ? pending.join("\n") : "（备课没有提出要验证的说法）",
    "",
    "## 已有结论",
    "（还没有）",
    "",
    "## 存疑",
    "（还没有）",
    "",
    "## 接下来",
    first ? `- 先聊主线材料 ${first.id}「${names.get(first.id) ?? first.id}」` : "- 按议程开始",
  ].join("\n");
}

/** 交笔记时的格式门：标题齐、备课假设的编号都还在且只在一段里（移动不是复制，否则"待验证还剩几条"失真）、不超长。不过返回退回原因；退回一次，第二次放行（turn.ts）。 */
export function notesVerdict(notes: string, hypothesisIds: string[]): string | null {
  const sections = noteSections(notes);
  const missing = NOTE_SECTIONS.filter((section) => !sections.has(section));
  if (missing.length > 0) return `笔记缺少段落：${missing.map((section) => `## ${section}`).join("、")}。四段固定标题都要有，整份重写`;
  const present = hypothesisIdsIn(notes);
  const lost = hypothesisIds.filter((id) => !present.has(id));
  if (lost.length > 0) return `笔记里 ${lost.map((id) => `[${id}]`).join("、")} 不见了：编号的条目只能在段落间移动（验证成立、被推翻、给不出都写进"已有结论"），不能删`;
  const pending = hypothesisIdsIn(sections.get("待验证") ?? "");
  const concluded = hypothesisIdsIn(sections.get("已有结论") ?? "");
  const copied = hypothesisIds.filter((id) => pending.has(id) && concluded.has(id));
  if (copied.length > 0) return `${copied.map((id) => `[${id}]`).join("、")} 同时在"待验证"和"已有结论"里：有结论了就从"待验证"移走，不要两处都留`;
  if (notes.length > NOTES_MAX_CHARS) return `笔记 ${notes.length} 字，超过 ${NOTES_MAX_CHARS} 字：压缩"已有结论"与"存疑"，一条一行`;
  return null;
}

/** "接下来"段的第一条：报告页"面试官是怎么问你的"用它当这一步的理由。 */
export function nextStepOf(notes: string): string | null {
  return noteItems(noteSections(notes).get("接下来"))[0] ?? null;
}

/** 这回合新记下的结论与存疑（相对上一版笔记）：报告页点亮"面试官记了存疑"用。 */
export function newlyNoted(previous: string | null, notes: string): string[] {
  const before = previous ? noteSections(previous) : new Map<NoteSection, string>();
  const after = noteSections(notes);
  const seen = new Set([...noteItems(before.get("已有结论")), ...noteItems(before.get("存疑"))]);
  return [...noteItems(after.get("已有结论")), ...noteItems(after.get("存疑"))].filter((item) => !seen.has(item));
}

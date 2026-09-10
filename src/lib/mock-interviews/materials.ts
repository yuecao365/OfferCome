/**
 * 面试房间的资料抽屉：候选人随时能核对自己简历里写了什么、岗位描述要什么。
 * 面试官对质时逐字引用的简历原句（消息里用「」括起）在抽屉里高亮，前端按逐字匹配定位。
 * 纯函数，本地版与体验版共用。
 */

export type InterviewMaterials = {
  resumeText: string;
  jobDescription: string;
};

/** 提示词要求用「」，模型偶尔写成“”：两种都认。 */
const QUOTE = /[「“]([^「」“”]{4,120})[」”]/g;

/** 面试官消息里用「」或“”括起、且逐字出现在资料里的片段，按出现顺序、去重。 */
export function quotedFragments(messages: { role: string; content: string }[], source: string): string[] {
  const found: string[] = [];
  for (const message of messages) {
    if (message.role !== "interviewer") continue;
    for (const match of message.content.matchAll(QUOTE)) {
      const fragment = match[1].trim();
      if (fragment && source.includes(fragment) && !found.includes(fragment)) found.push(fragment);
    }
  }
  return found;
}

export type HighlightSegment = { text: string; hit: boolean };

/** 把资料按引用片段切开：hit 的段就是要高亮的原句。片段不重叠，先出现的先切。 */
export function highlightSegments(text: string, fragments: string[]): HighlightSegment[] {
  const marks: { start: number; end: number }[] = [];
  for (const fragment of fragments) {
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(fragment, from);
      if (index < 0) break;
      const end = index + fragment.length;
      if (!marks.some((mark) => index < mark.end && end > mark.start)) marks.push({ start: index, end });
      from = end;
    }
  }
  marks.sort((left, right) => left.start - right.start);
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) segments.push({ text: text.slice(cursor, mark.start), hit: false });
    segments.push({ text: text.slice(mark.start, mark.end), hit: true });
    cursor = mark.end;
  }
  if (cursor < text.length || segments.length === 0) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}

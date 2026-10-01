import { normalizedText } from "./similarity";

const WRAPPING_QUOTES = /^[\s“”‘’"'「」『』《》【】•·▪*]+|[\s“”‘’"'「」『』《》【】。；;，,.:]+$/g;
const QUOTED_SEGMENT = /[“"「『]([^”"」』]{2,})[”"」』]/g;

/** 引用至少这么长才算得上证据。 */
const MIN_EVIDENCE_CHARS = 4;

/** 靠空格分词的文字（拉丁字母、数字）：引用的首尾落在这类字符上时，必须对齐原文的词边界。 */
const WORD_CHAR = /[\p{Script=Latin}\p{N}_]/u;

/**
 * 排版变体归一：弯引号 / 撇号、各种连字符与破折号。NFKC 已经处理了全角与省略号。
 * 模型抄英文原文时常把 ’ 写成 '、把 – 写成 -，这不是改写。
 */
function typographic(value: string): string {
  return value
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-");
}

/** 去掉空白后的文本，外加每个字符前面原来有没有空白（判词边界用）。 */
type Canonical = { text: string; gapBefore: boolean[] };

function canonical(value: string): Canonical {
  const normalized = typographic(normalizedText(value));
  let text = "";
  const gapBefore: boolean[] = [];
  let gap = true;
  for (const char of normalized) {
    if (/\s/.test(char)) {
      gap = true;
      continue;
    }
    gapBefore[text.length] = gap;
    text += char;
    gap = false;
  }
  gapBefore[text.length] = true;
  return { text, gapBefore };
}

const isWordChar = (char: string | undefined) => char !== undefined && WORD_CHAR.test(char);

/**
 * 在原文里找到引用，且首尾不切在一个英文单词中间（"lead" 不算 "leadership" 的逐字引用）。
 * 中文没有词边界，首尾是中文字符时不设这条限制，结果与只比较去空白文本一致。
 */
function occursAtWordBoundary(haystack: Canonical, needle: string): boolean {
  const first = needle[0];
  const last = needle[needle.length - 1];
  for (let at = haystack.text.indexOf(needle); at >= 0; at = haystack.text.indexOf(needle, at + 1)) {
    const end = at + needle.length;
    const startOk = !isWordChar(first) || !isWordChar(haystack.text[at - 1]) || haystack.gapBefore[at];
    const endOk = !isWordChar(last) || !isWordChar(haystack.text[end]) || haystack.gapBefore[end];
    if (startOk && endOk) return true;
  }
  return false;
}

/**
 * 模型常把逐字引用用“”包起来，或写成“该岗位需要“……””这种带前缀的形式。
 * 引号不是原文的一部分，去掉包裹引号后整体匹配；仍不匹配就取引号内片段逐个试。
 */
function evidenceCandidates(evidence: string): string[] {
  const stripped = evidence.replace(WRAPPING_QUOTES, "");
  const quoted = [...evidence.matchAll(QUOTED_SEGMENT)].map((match) => match[1]);
  return [stripped, ...quoted].map((item) => canonical(item).text).filter((item) => item.length >= MIN_EVIDENCE_CHARS);
}

/**
 * 证据是否逐字出现在原文里（蓝图的 jdEvidence、简报的依据与简历假设共用）：同样的字，
 * 忽略空格与换行、大小写、引号与连字符的排版变体；英文引用的首尾必须落在词边界上。
 * 意译与改写仍然不算——归一只消掉排版差异，不放松字面。
 */
export function isVerbatimEvidence(source: string, evidence: string): boolean {
  const haystack = canonical(source);
  return evidenceCandidates(evidence).some((candidate) => occursAtWordBoundary(haystack, candidate));
}

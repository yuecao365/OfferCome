import { denseText } from "./similarity";

const WRAPPING_QUOTES = /^[\s“”‘’"'「」『』《》【】]+|[\s“”‘’"'「」『』《》【】。；;，,]+$/g;
const QUOTED_SEGMENT = /[“"「『]([^”"」』]{2,})[”"」』]/g;

/** 引用至少这么长才算得上证据。 */
const MIN_EVIDENCE_CHARS = 4;

/**
 * 模型常把逐字引用用“”包起来，或写成“该岗位需要“……””这种带前缀的形式。
 * 引号不是原文的一部分，去掉包裹引号后整体匹配；仍不匹配就取引号内片段逐个试。
 */
function evidenceCandidates(evidence: string): string[] {
  const stripped = evidence.replace(WRAPPING_QUOTES, "");
  const quoted = [...evidence.matchAll(QUOTED_SEGMENT)].map((match) => match[1]);
  return [stripped, ...quoted].map(denseText).filter((item) => item.length >= MIN_EVIDENCE_CHARS);
}

/**
 * 证据是否逐字出现在原文里：同样的字，忽略空格与换行（蓝图的 jdEvidence、简报的依据与简历假设共用）。
 * 意译与改写仍然不算——去空白只消掉排版差异，不放松字面。
 */
export function isVerbatimEvidence(source: string, evidence: string): boolean {
  const haystack = denseText(source);
  return evidenceCandidates(evidence).some((candidate) => haystack.includes(candidate));
}

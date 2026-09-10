import { normalizedText } from "./similarity";

const WRAPPING_QUOTES = /^[\s“”‘’"'「」『』《》【】]+|[\s“”‘’"'「」『』《》【】。；;，,]+$/g;
const QUOTED_SEGMENT = /[“"「『]([^”"」』]{2,})[”"」』]/g;

/**
 * 模型常把逐字引用用“”包起来，或写成“该岗位需要“……””这种带前缀的形式。
 * 引号不是原文的一部分，去掉包裹引号后整体匹配；仍不匹配就取引号内片段逐个试。
 */
function evidenceCandidates(evidence: string): string[] {
  const stripped = evidence.replace(WRAPPING_QUOTES, "");
  const quoted = [...evidence.matchAll(QUOTED_SEGMENT)].map((match) => match[1]);
  return [stripped, ...quoted].map(normalizedText).filter((item) => item.length >= 2);
}

/** 证据是否逐字出现在原文里（岗位蓝图的 jdEvidence 用它把关）。 */
export function isVerbatimEvidence(source: string, evidence: string): boolean {
  const haystack = normalizedText(source);
  return evidenceCandidates(evidence).some((candidate) => haystack.includes(candidate));
}

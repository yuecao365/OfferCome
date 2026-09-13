export function normalizedText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function characterNgrams(value: string): Set<string> {
  const normalized = normalizedText(value).replace(/[^\p{L}\p{N}+#]/gu, "");
  const result = new Set<string>();
  if (normalized.length < 3) {
    if (normalized) result.add(normalized);
    return result;
  }
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    result.add(normalized.slice(index, index + 3));
  }
  return result;
}

/** text 覆盖了 target 多少：target 的 3 元字符组里有多大比例出现在 text 里（0–1）。 */
export function coverage(text: string, target: string): number {
  const targetNgrams = characterNgrams(target);
  if (targetNgrams.size === 0) return 0;
  const textNgrams = characterNgrams(text);
  let hit = 0;
  for (const token of targetNgrams) {
    if (textNgrams.has(token)) hit += 1;
  }
  return hit / targetNgrams.size;
}

export function questionSimilarity(left: string, right: string): number {
  const leftNgrams = characterNgrams(left);
  const rightNgrams = characterNgrams(right);
  if (leftNgrams.size === 0 || rightNgrams.size === 0) return 0;
  let intersection = 0;
  for (const token of leftNgrams) {
    if (rightNgrams.has(token)) intersection += 1;
  }
  return (2 * intersection) / (leftNgrams.size + rightNgrams.size);
}

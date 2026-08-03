import { createHash } from "node:crypto";

export function normalizeRoleTitle(title: string): string {
  return title
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/(?:高级|资深|初级|中级|senior|junior|lead|intern|实习)/g, " ")
    .replace(/[\s/_-]+/g, " ")
    .trim();
}

export function roleContextKey(title: string): string {
  const normalized = normalizeRoleTitle(title) || "未分类岗位";
  return `role_${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
}

import { createHash } from "node:crypto";

import { normalizeRoleTitle } from "./role-title";

export { normalizeRoleTitle };

export function roleContextKey(title: string): string {
  const normalized = normalizeRoleTitle(title) || "未分类岗位";
  return `role_${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
}

import { tool } from "ai";
import { z } from "zod";

import type { LoopTool } from "@/lib/ai/agent-loop";

import { lookupLines } from "./resume-lookup";

/**
 * 查候选人档案（只读工具）：按关键词从上几场的档案里取相关的行（说法验证、反复出现的短板、问过的角度）。
 * 档案在备课时存进会话快照，这里不查库；没有档案就不给这个工具。
 */
export function createRecallTool(dossier: string | null | undefined): LoopTool | null {
  if (!dossier?.trim()) return null;
  return {
    access: "read",
    ...tool({
      description: "按关键词查这位候选人上几场模拟面试的档案（已验证 / 没讲清的说法、反复出现的短板、问过的项目角度），逐行返回。",
      inputSchema: z.object({ keyword: z.string().min(1).max(40) }),
      execute: async ({ keyword }) => ({ keyword, lines: lookupLines(dossier, keyword) }),
    }),
  };
}

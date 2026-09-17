import { tool } from "ai";
import { z } from "zod";

import type { LoopTool } from "@/lib/ai/agent-loop";

/**
 * 查简历原文（只读工具）：按关键词返回包含它的段落。面试官（简历超长、节选里没有时）与评分（核对回答里的数字与事实）共用。
 * 返回原句而不是摘要：调用方要逐字引用（评分的 resumeSays 必须是简历子串）。
 */

const MAX_LINES = 8;
const MAX_LINE_CHARS = 400;

export function lookupResumeLines(resumeText: string, keyword: string): string[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return [];
  return resumeText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().includes(needle))
    .slice(0, MAX_LINES)
    .map((line) => line.slice(0, MAX_LINE_CHARS));
}

export function createResumeLookupTool(resumeText: string): LoopTool {
  return {
    access: "read",
    ...tool({
      description: "按关键词查候选人简历原文里包含它的段落（逐字返回，可直接引用）。查不到时换更短的关键词再试一次。",
      inputSchema: z.object({ keyword: z.string().min(1).max(40) }),
      execute: async ({ keyword }) => ({ keyword, lines: lookupResumeLines(resumeText, keyword) }),
    }),
  };
}

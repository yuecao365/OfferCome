import { tool } from "ai";
import { z } from "zod";

import type { LoopTool } from "@/lib/ai/agent-loop";
import type { InterviewMemory } from "@/lib/interview/memory";

/**
 * 查上几场（只读工具）：从会话快照里的记忆按关键词取这位候选人上几场的说法验证与短板。
 * 记忆在备课时已 recall 进快照，这里不查库；没有上几场就不给这个工具。
 */

const MAX_ITEMS = 6;

export type RecallHit = { kind: "claim" | "weakness"; text: string; detail: string | null; at: string };

export function recallByKeyword(memory: InterviewMemory, keyword: string): RecallHit[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return [];
  const hit = (...parts: (string | null)[]) => parts.some((part) => part?.toLowerCase().includes(needle));
  const claims: RecallHit[] = memory.claims
    .filter((item) => hit(item.text, item.evidence, item.note))
    .map((item) => ({ kind: "claim", text: `${item.status === "confirmed" ? "已验证" : "被推翻"}：${item.text}`, detail: item.note, at: item.at }));
  const weaknesses: RecallHit[] = memory.weaknesses
    .filter((item) => hit(item.point, item.quote, item.areaName))
    .map((item) => ({ kind: "weakness", text: item.point, detail: item.areaName, at: item.at }));
  return [...claims, ...weaknesses].sort((left, right) => right.at.localeCompare(left.at)).slice(0, MAX_ITEMS);
}

export function createRecallTool(memory: InterviewMemory): LoopTool | null {
  if (memory.sessions === 0) return null;
  return {
    access: "read",
    ...tool({
      description: `按关键词查这位候选人上 ${memory.sessions} 场模拟面试里的说法验证结果与评分短板（同一材料上几场也漏了什么）。`,
      inputSchema: z.object({ keyword: z.string().min(1).max(40) }),
      execute: async ({ keyword }) => ({ keyword, sessions: memory.sessions, hits: recallByKeyword(memory, keyword) }),
    }),
  };
}

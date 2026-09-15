import "server-only";

import { after } from "next/server";

import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { appendEvents, parseEventRow, transcriptOf, type InterviewEvent } from "./events";
import { labelingDue, labelRecent } from "./labeler";

/**
 * 面试中的后台任务：标注器在响应返回后异步跑，每两次交换标一次；产物是 label_added 事件。
 * 与下一回合的落库可能同时分配 seq（唯一约束冲突）：冲突就放弃这次，下次再标。
 */
export function scheduleLabeling(sessionId: string): void {
  after(async () => {
    try {
      const loaded = await prisma.mockInterviewSession.findUnique({ where: { id: sessionId }, include: { events: { orderBy: { seq: "asc" } } } });
      if (!loaded || loaded.status !== "in_progress") return;
      const brief = parseStoredBrief(loaded.briefJson);
      if (!brief) return;
      const events = loaded.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
      const transcript = transcriptOf(events);
      if (!labelingDue(transcript, events)) return;
      const labels = await labelRecent({ runId: `label:${sessionId}:${transcript.length}`, config: await getAiTaskConfig("text"), brief, transcript, events });
      await appendEvents(prisma, sessionId, labels);
    } catch (error) {
      console.warn("[interview] 标注器这次没跑成，下次再标。", error instanceof Error ? error.message : error);
    }
  });
}

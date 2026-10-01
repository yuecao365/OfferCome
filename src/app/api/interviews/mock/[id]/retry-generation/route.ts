import { scheduleMockInterviewGeneration } from "@/lib/mock-interviews/generation-background";
import { acceptDegradedMockInterview, claimMockInterviewGenerationRetry } from "@/lib/mock-interviews/service";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

const messages = defineMessages({
  "zh-CN": { stale: "生成状态已变化，请刷新页面。" },
  en: { stale: "The preparation status has changed. Refresh the page." },
});

/** 备课没成之后的两个动作：重新备课（默认），或看过说明后"就这样开始"（body.mode = "accept"）。 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getMessages(messages);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
  if (body.mode === "accept") {
    const started = await acceptDegradedMockInterview(id);
    if (!started) return Response.json({ error: t.stale }, { status: 409 });
    return Response.json({ status: "in_progress" });
  }
  const claimed = await claimMockInterviewGenerationRetry(id);
  if (!claimed) return Response.json({ error: t.stale }, { status: 409 });
  scheduleMockInterviewGeneration(id);
  return Response.json({ status: "generating" });
}

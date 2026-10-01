import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";
import { completeMockInterview } from "@/lib/mock-interviews/service";

const messages = defineMessages({
  "zh-CN": { failed: "生成面试报告失败。" },
  en: { failed: "Couldn't generate the interview report." },
});

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getMessages(messages);
  try {
    const { id } = await params;
    return Response.json({ report: await completeMockInterview(id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : t.failed },
      { status: 400 },
    );
  }
}

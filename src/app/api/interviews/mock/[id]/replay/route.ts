import { describeAgentError } from "@/lib/ai/run-agent";
import { replayMockInterviewTurn } from "@/lib/interview/orchestrator";

/**
 * 重放到某一步（G6 步调试）：把事件日志回到那一回合之前的状态，用现在的代码与提示词把那一回合再跑一次，
 * 不落库、不改这场面试；返回这次会说什么、代码会不会否决、开销多少。一次一调模型。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { turnIndex?: unknown };
  const turnIndex = Number(body.turnIndex);
  if (!Number.isInteger(turnIndex) || turnIndex < 0) return Response.json({ error: "turnIndex 必须是非负整数。" }, { status: 400 });
  try {
    const result = await replayMockInterviewTurn(id, turnIndex);
    if (!result) return Response.json({ error: "没有这一回合。" }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: describeAgentError(error) }, { status: 500 });
  }
}

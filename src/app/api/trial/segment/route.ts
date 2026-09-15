import { segmentTranscript } from "@/lib/interview/aftermath/segmenter";
import { segmentRecord } from "@/lib/interview/aftermath/segments";
import type { ConversationMessage } from "@/lib/interview/views";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { getAiTaskConfig } from "@/lib/settings/ai";
import type { TrialSegment } from "@/lib/trial/interview";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { brief: InterviewBrief; messages: ConversationMessage[]; round: string | null };

/** 体验版的整理员：面试结束后把浏览器带上来的逐字稿切段，交回兼容题目（未评分）。 */
export const POST = withTrialAi<Body>(async (body) => {
  if (!body.brief || !Array.isArray(body.messages)) return { segments: [] as TrialSegment[], hypotheses: [] };
  const transcript = body.messages.map((message, seq) => ({ seq, role: message.role, content: message.content, kind: message.role === "interviewer" ? message.kind : null, control: null }));
  const { segments, hypotheses } = await segmentTranscript({ runId: `trial-segment:${Date.now()}`, config: await getAiTaskConfig("text"), transcript, brief: body.brief });
  const areas = new Map(body.brief.areas.map((area) => [area.id, area]));
  return {
    hypotheses,
    segments: segments.map((segment): TrialSegment => {
      const probes = transcript.filter((line) => line.role === "interviewer" && line.seq > segment.startSeq && line.seq <= segment.endSeq).map((line) => line.content);
      const record = segmentRecord(segment.areaId ? (areas.get(segment.areaId) ?? null) : null, segment, probes, body.round);
      return { id: crypto.randomUUID(), ...record, evaluationStatus: "pending", evaluation: null };
    }),
  };
});

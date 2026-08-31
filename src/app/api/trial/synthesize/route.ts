import { synthesizeCandidateInsights } from "@/lib/candidate-profile/agent";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 90;

type Body = {
  roleKey: string;
  metrics: unknown;
  observations: { id: string }[];
  lockedInsights: unknown;
};

/**
 * 观察 → 画像洞察。与本地版共用同一个总结 agent；
 * 引用真实性在这里把关（observationId 必须真实存在），浏览器只做存取。
 */
export const POST = withTrialAi<Body>(async (body) => {
  const { synthesis } = await synthesizeCandidateInsights(body);
  const known = new Set(body.observations.map((item) => item.id));
  const insights = synthesis.insights.flatMap((insight) => {
    const evidence = insight.evidence.filter((reference) =>
      known.has(reference.observationId),
    );
    return evidence.length > 0 ? [{ ...insight, evidence }] : [];
  });
  return { insights };
});

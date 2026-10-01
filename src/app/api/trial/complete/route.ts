import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { allSkippedSummary, areaOutcomes, buildReport, summaryInput, type OutcomeQuestion, type OutcomeThread } from "@/lib/mock-interviews/outcome";
import { summarizeMockInterview } from "@/lib/mock-interviews/summary-agent";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  jobTitle: string;
  brief: InterviewBrief;
  notes: string;
  threads: OutcomeThread[];
  questions: OutcomeQuestion[];
};

/** 交卷：与本地版 completeMockInterview 同一套拼装与汇总；评分已由浏览器逐段收齐。 */
export const POST = withTrialAi<Body>(async (body) => {
  // 浏览器存档里的旧简报没有 language，按中文。
  const language = body.brief.language === "en" ? "en" : "zh";
  const areas = areaOutcomes(body.brief, body.threads, body.questions);
  const answered = body.questions.some((question) => !question.skipped && question.evaluation);
  const summary = answered
    ? await summarizeMockInterview(summaryInput({ jobTitle: body.jobTitle, brief: body.brief, areas, notes: typeof body.notes === "string" ? body.notes : "" }), language)
    : allSkippedSummary(language);
  return { report: buildReport(areas, summary) };
});

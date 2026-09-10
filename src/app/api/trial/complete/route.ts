import type { InterviewBrief } from "@/lib/mock-interviews/interviewer/brief";
import type { InterviewMemory } from "@/lib/mock-interviews/interviewer/memory";
import { ALL_SKIPPED_SUMMARY, areaOutcomes, buildReport, summaryInput, type OutcomeQuestion, type OutcomeThread } from "@/lib/mock-interviews/outcome";
import { summarizeMockInterview } from "@/lib/mock-interviews/summary-agent";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  jobTitle: string;
  brief: InterviewBrief;
  memory: InterviewMemory;
  threads: OutcomeThread[];
  questions: OutcomeQuestion[];
};

/** 交卷：与本地版 completeMockInterview 同一套拼装与汇总；评分已由浏览器逐段收齐。 */
export const POST = withTrialAi<Body>(async (body) => {
  const areas = areaOutcomes(body.brief, body.threads, body.questions);
  const answered = body.questions.some((question) => !question.skipped && question.evaluation);
  const summary = answered
    ? await summarizeMockInterview(summaryInput({ jobTitle: body.jobTitle, brief: body.brief, areas, memory: body.memory }))
    : ALL_SKIPPED_SUMMARY;
  return { report: buildReport(areas, summary) };
});

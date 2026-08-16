import "server-only";

import { prisma } from "@/lib/db";

import { normalizeInterviewRound, type InterviewRound } from "./types";

/** 面试结束后仍留出一段时间提醒补录，超过这个窗口就不再打扰。 */
const RECENTLY_FINISHED_WINDOW_MS = 72 * 60 * 60_000;
const UPCOMING_LIMIT = 3;

export type UpcomingInterview = {
  id: string;
  companyName: string;
  jobTitle: string;
  round: InterviewRound | null;
  interviewedAt: Date;
};

export type UpcomingInterviews = {
  /** 还没到时间的待面试，最近的排在前面。 */
  upcoming: UpcomingInterview[];
  /** 时间已过但还没补录问答的，提示用户回来记录。 */
  awaitingRecord: UpcomingInterview[];
};

const UPCOMING_SELECT = {
  id: true,
  companyName: true,
  jobTitle: true,
  round: true,
  interviewedAt: true,
} as const;

function toUpcomingInterview(row: {
  id: string;
  companyName: string;
  jobTitle: string;
  round: string | null;
  interviewedAt: Date | null;
}): UpcomingInterview | null {
  if (!row.interviewedAt) return null;
  return {
    id: row.id,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    round: normalizeInterviewRound(row.round),
    interviewedAt: row.interviewedAt,
  };
}

export async function getUpcomingInterviews(
  now: Date = new Date(),
): Promise<UpcomingInterviews> {
  const [upcomingRows, awaitingRows] = await Promise.all([
    prisma.interview.findMany({
      where: {
        kind: "real",
        status: "scheduled",
        interviewedAt: { gt: now },
      },
      orderBy: { interviewedAt: "asc" },
      take: UPCOMING_LIMIT,
      select: UPCOMING_SELECT,
    }),
    prisma.interview.findMany({
      where: {
        kind: "real",
        status: "scheduled",
        interviewedAt: {
          lte: now,
          gte: new Date(now.getTime() - RECENTLY_FINISHED_WINDOW_MS),
        },
      },
      orderBy: { interviewedAt: "desc" },
      take: UPCOMING_LIMIT,
      select: UPCOMING_SELECT,
    }),
  ]);

  return {
    upcoming: upcomingRows.flatMap((row) => toUpcomingInterview(row) ?? []),
    awaitingRecord: awaitingRows.flatMap((row) => toUpcomingInterview(row) ?? []),
  };
}

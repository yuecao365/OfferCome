import "server-only";

import { prisma } from "@/lib/db";

import {
  PROFILE_AGGREGATION_VERSION,
  PROFILE_DEBOUNCE_MS,
  PROFILE_ASSESSMENT_VERSION,
  PROFILE_STATE_ID,
  type ProfileRefreshStatus,
} from "./types";

export async function ensureCandidateProfileState() {
  const state = await prisma.candidateProfileState.upsert({
    where: { id: PROFILE_STATE_ID },
    create: { id: PROFILE_STATE_ID },
    update: {},
  });
  if (state.needsFullRebuild && state.status === "idle") {
    const now = new Date();
    return prisma.candidateProfileState.update({
      where: { id: PROFILE_STATE_ID },
      data: {
        status: "pending",
        phase: "rebuild_required",
        pendingSince: now,
        dueAt: now,
      },
    });
  }
  if (state.revision > 0 && !state.needsFullRebuild) {
    const currentSnapshot = await prisma.candidateProfileSnapshot.findFirst({
      where: { assessmentVersion: PROFILE_ASSESSMENT_VERSION },
      select: { id: true },
    });
    if (!currentSnapshot || state.assessmentVersion !== PROFILE_AGGREGATION_VERSION) {
      const totalCount = await prisma.interview.count({ where: { status: "completed" } });
      return prisma.candidateProfileState.update({
        where: { id: PROFILE_STATE_ID },
        data: {
          status: "pending",
          needsFullRebuild: true,
          phase: "rebuild_required",
          pendingSince: new Date(),
          dueAt: new Date(),
          completedCount: 0,
          totalCount,
        },
      });
    }
  }
  return state;
}

export async function markCandidateProfileDirty({
  fullRebuild = false,
  debounceMs = PROFILE_DEBOUNCE_MS,
}: { fullRebuild?: boolean; debounceMs?: number } = {}): Promise<void> {
  const now = new Date();
  const dueAt = new Date(now.getTime() + Math.max(0, debounceMs));

  await prisma.candidateProfileState.upsert({
    where: { id: PROFILE_STATE_ID },
    create: {
      id: PROFILE_STATE_ID,
      status: "pending",
      pendingSince: now,
      dueAt,
      lastSourceAt: now,
      needsFullRebuild: fullRebuild,
    },
    update: {
      status: "pending",
      pendingSince: now,
      dueAt,
      lastSourceAt: now,
      ...(fullRebuild ? { needsFullRebuild: true } : {}),
      lastError: null,
    },
  });
}

export async function getProfileRefreshStatus(): Promise<ProfileRefreshStatus> {
  const state = await ensureCandidateProfileState();
  return {
    status: state.status,
    phase: state.phase,
    revision: state.revision,
    pending:
      state.status === "pending" ||
      state.status === "running" ||
      (state.status === "failed" && Boolean(state.pendingSince)),
    completedCount: state.completedCount,
    totalCount: state.totalCount,
    dueAt: state.dueAt?.toISOString() ?? null,
    lastRefreshedAt: state.lastRefreshedAt?.toISOString() ?? null,
    lastError: state.lastError,
  };
}

export async function acquireProfileRefreshLease({
  force,
}: {
  force: boolean;
}): Promise<
  | { acquired: true; token: string; fullRebuild: boolean; sourceCutoff: Date }
  | { acquired: false; reason: "not_due" | "running" | "clean" }
> {
  const state = await ensureCandidateProfileState();
  const now = new Date();

  if (!force && state.status === "idle") {
    return { acquired: false, reason: "clean" };
  }
  if (!force && state.dueAt && state.dueAt > now) {
    return { acquired: false, reason: "not_due" };
  }
  if (
    state.status === "running" &&
    state.leaseExpiresAt &&
    state.leaseExpiresAt > now
  ) {
    return { acquired: false, reason: "running" };
  }

  const token = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + 5 * 60_000);
  const claimed = await prisma.candidateProfileState.updateMany({
    where: {
      id: PROFILE_STATE_ID,
      OR: [
        { status: { not: "running" } },
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      status: "running",
      phase: "assessment",
      leaseToken: token,
      leaseExpiresAt,
      lastError: null,
    },
  });

  if (claimed.count === 0) {
    return { acquired: false, reason: "running" };
  }

  return {
    acquired: true,
    token,
    fullRebuild: state.needsFullRebuild,
    sourceCutoff: now,
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import { hasRequiredPrismaDelegates, selectPrismaClient } from "./db";

test("detects stale Prisma clients that do not expose all model delegates", () => {
  assert.equal(
    hasRequiredPrismaDelegates({
      bossContact: { findMany() {} },
    }),
    false,
  );
});

test("reuses only Prisma clients with all required model delegates", () => {
  const freshClient = {
    appSetting: { findMany() {} },
    bossContact: { findMany() {} },
    resume: { findMany() {} },
    resumeProject: { findMany() {} },
    resumeProjectSource: { findMany() {} },
    interview: { findMany() {} },
    interviewQuestion: { findMany() {} },
    mockInterviewSession: { findMany() {} },
    interviewQuestionEvaluation: { findMany() {} },
    roleContext: { findMany() {} },
    interviewImportArtifact: { findMany() {} },
    interviewAssessment: { findMany() {} },
    abilityObservation: { findMany() {} },
    candidateProfileState: { findMany() {} },
    candidateInsight: { findMany() {} },
    candidateInsightEvidence: { findMany() {} },
    candidateProfileMetric: { findMany() {} },
    candidateProfileSnapshot: { findMany() {} },
    candidateProfileRun: { findMany() {} },
  };
  const replacementClient = {
    appSetting: { findMany() {} },
    bossContact: { findMany() {} },
    resume: { findMany() {} },
    resumeProject: { findMany() {} },
    resumeProjectSource: { findMany() {} },
    interview: { findMany() {} },
    interviewQuestion: { findMany() {} },
    mockInterviewSession: { findMany() {} },
    interviewQuestionEvaluation: { findMany() {} },
    roleContext: { findMany() {} },
    interviewImportArtifact: { findMany() {} },
    interviewAssessment: { findMany() {} },
    abilityObservation: { findMany() {} },
    candidateProfileState: { findMany() {} },
    candidateInsight: { findMany() {} },
    candidateInsightEvidence: { findMany() {} },
    candidateProfileMetric: { findMany() {} },
    candidateProfileSnapshot: { findMany() {} },
    candidateProfileRun: { findMany() {} },
  };

  assert.equal(hasRequiredPrismaDelegates(freshClient), true);
  assert.equal(
    selectPrismaClient(freshClient, () => replacementClient as never),
    freshClient,
  );
  assert.equal(
    selectPrismaClient(
      { bossContact: { findMany() {} } },
      () => replacementClient as never,
    ),
    replacementClient,
  );
});

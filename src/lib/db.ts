import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "../generated/prisma/client";
import { isDemoMode } from "./runtime-mode";
import { resolvePrismaSqliteUrl } from "./sqlite-url";

function getDatabaseUrl(): string {
  if (isDemoMode()) {
    const source = path.join(process.cwd(), "prisma", "demo.db");
    const directory = path.join(tmpdir(), "offerlai-demo");
    const target = path.join(directory, `demo-${process.pid}.db`);
    mkdirSync(directory, { recursive: true });
    copyFileSync(source, target);
    return `file:${target}`;
  }

  return process.env.DATABASE_URL ?? "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const REQUIRED_PRISMA_DELEGATES = [
  "appSetting",
  "bossContact",
  "resume",
  "resumeProject",
  "resumeProjectSource",
  "interview",
  "interviewQuestion",
  "mockInterviewSession",
  "interviewQuestionEvaluation",
  "roleContext",
  "interviewImportArtifact",
  "interviewAssessment",
  "abilityObservation",
  "candidateProfileState",
  "candidateInsight",
  "candidateInsightEvidence",
  "candidateProfileMetric",
  "candidateProfileSnapshot",
  "candidateProfileRun",
] as const;

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: resolvePrismaSqliteUrl(getDatabaseUrl()),
    }),
  });
}

export function hasRequiredPrismaDelegates(client: unknown): boolean {
  if (!client || typeof client !== "object") {
    return false;
  }

  const record = client as Record<string, unknown>;
  return REQUIRED_PRISMA_DELEGATES.every((delegateName) => {
    const delegate = record[delegateName];
    return (
      Boolean(delegate) &&
      typeof delegate === "object" &&
      typeof (delegate as Record<string, unknown>).findMany === "function"
    );
  });
}

export function selectPrismaClient(
  existingClient: unknown,
  createClient: () => PrismaClient,
): PrismaClient {
  return hasRequiredPrismaDelegates(existingClient)
    ? (existingClient as PrismaClient)
    : createClient();
}

export const prisma = selectPrismaClient(globalForPrisma.prisma, createPrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

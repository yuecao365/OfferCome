import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "../generated/prisma/client";
import { isDemoMode, isTrialMode } from "./runtime-mode";
import { resolvePrismaSqliteUrl } from "./sqlite-url";
import { createTrialPrismaProxy } from "./trial/db";

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

function createPrismaClientForUrl(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: resolvePrismaSqliteUrl(databaseUrl),
    }),
  });
}

function createPrismaClient(): PrismaClient {
  return createPrismaClientForUrl(getDatabaseUrl());
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

// 体验模式下每个访客会话一个库，prisma 是按会话惰性解析的代理；
// 其余模式保持进程级单例。
export const prisma: PrismaClient = isTrialMode()
  ? createTrialPrismaProxy(createPrismaClientForUrl)
  : selectPrismaClient(globalForPrisma.prisma, createPrismaClient);

if (process.env.NODE_ENV !== "production" && !isTrialMode()) {
  globalForPrisma.prisma = prisma;
}

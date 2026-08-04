import Database from "better-sqlite3";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function main() {
  const projectRoot = process.cwd();
  const databasePath = path.resolve(projectRoot, "prisma", "demo.db");
  const expectedPath = path.join(projectRoot, "prisma", "demo.db");

  if (databasePath !== expectedPath) {
    throw new Error("Unexpected demo database path.");
  }

  const prismaCli = path.resolve(projectRoot, "node_modules", "prisma", "build", "index.js");
  const schemaResult = spawnSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );

  if (schemaResult.status !== 0 || !schemaResult.stdout.includes("CREATE TABLE")) {
    throw new Error(schemaResult.stderr || "Unable to generate the demo database schema.");
  }

  if (existsSync(databasePath)) rmSync(databasePath);
  const database = new Database(databasePath);
  try {
    database.exec(schemaResult.stdout);
  } finally {
    database.close();
  }

  process.env.DATABASE_URL = `file:${databasePath}`;
  await import("./seed-demo");
}

void main();

import process from "node:process";

import { prisma } from "../src/lib/db";
import {
  printBossSyncContacts,
  printBossSyncDiagnostics,
  runBossSync,
} from "../src/lib/boss/sync";
import { parseBossSyncMaxPages } from "../src/lib/boss/sync-policy";

function isDryRun(): boolean {
  return process.argv.slice(2).includes("--dry-run");
}

async function main(): Promise<void> {
  const result = await runBossSync({
    db: prisma,
    dryRun: isDryRun(),
    maxPages: parseBossSyncMaxPages(process.argv.slice(2)),
    onWarning: (message, error) => {
      console.warn(`[boss:sync] ${message}`);

      if (error) {
        console.warn(error);
      }
    },
  });

  printBossSyncDiagnostics(result.diagnostics);
  console.log(
    `[boss:sync] Stop reason: ${result.stopReason ?? "(none)"}, pagesRead=${result.diagnostics.length}`,
  );

  if (result.contacts.length === 0 && result.status === "success") {
    console.warn(
      '[boss:sync] No records were recognized in the Boss browser page. Confirm the account can see the communicated/recommend list at https://www.zhipin.com/web/geek/recommend.',
    );
  }

  if (isDryRun()) {
    printBossSyncContacts(result.contacts);
  }

  console.log(
    `[boss:sync] Summary: found=${result.found}, inserted=${result.inserted}, updated=${result.updated}, failed=${result.failed}`,
  );

  if (!result.success) {
    console.error(`[boss:sync] ${result.message}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error("[boss:sync] Sync failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

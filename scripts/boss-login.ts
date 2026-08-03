import process from "node:process";

import { runBossLogin } from "../src/lib/boss/login";

async function main(): Promise<void> {
  const result = await runBossLogin({
    completion: "terminal-enter",
    onMessage: (message) => console.log(`[boss:login] ${message}`),
  });

  if (!result.success) {
    throw new Error(result.message);
  }

  console.log(`[boss:login] ${result.message}`);
}

main().catch((error: unknown) => {
  console.error("[boss:login] Failed to save storage state.");
  console.error(error);
  process.exitCode = 1;
});

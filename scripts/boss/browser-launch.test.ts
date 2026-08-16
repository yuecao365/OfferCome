import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildBrowserLaunchArgs,
  pickExistingPath,
} from "../../src/lib/boss/browser-launch";

test("builds a visible CDP launch command for Boss login", () => {
  const args = buildBrowserLaunchArgs({
    userDataDir: path.resolve("C:/tmp/boss-profile"),
    remoteDebuggingPort: 9333,
    url: "https://www.zhipin.com/",
  });

  assert.deepEqual(args, [
    "--remote-debugging-port=9333",
    `--user-data-dir=${path.resolve("C:/tmp/boss-profile")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--new-window",
    "https://www.zhipin.com/",
  ]);
});

test("moves the sync window off-screen when requested", () => {
  const args = buildBrowserLaunchArgs({
    userDataDir: path.resolve("C:/tmp/boss-profile"),
    remoteDebuggingPort: 9333,
    url: "about:blank",
    offScreen: true,
  });

  assert.ok(args.includes("--window-position=-32000,-32000"));
  assert.ok(args.includes("--disable-renderer-backgrounding"));
});

test("picks the first existing browser path", () => {
  const existing = path.resolve("C:/Program Files/Browser/browser.exe");
  const picked = pickExistingPath([path.resolve("C:/missing.exe"), existing], {
    existsSync: (candidate) => candidate === existing,
  });

  assert.equal(picked, existing);
});

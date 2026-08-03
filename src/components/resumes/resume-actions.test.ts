import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("./resume-actions.tsx", import.meta.url),
  "utf8",
);

test("delete confirmation explains that saved internships and projects are kept", () => {
  assert.match(source, /不会删除已保存的实习\/项目记录/);
});


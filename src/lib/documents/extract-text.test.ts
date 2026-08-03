import assert from "node:assert/strict";
import test from "node:test";

import { extractDocumentText } from "./extract-text";

test("extracts UTF-8 text and markdown uploads", async () => {
  const text = await extractDocumentText({
    bytes: Buffer.from("问题：请介绍项目？\r\n回答：Career Agent"),
    fileName: "interview.md",
    mimeType: "text/markdown",
  });

  assert.equal(text, "问题：请介绍项目？\n回答：Career Agent");
});

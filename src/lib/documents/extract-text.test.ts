import assert from "node:assert/strict";
import test from "node:test";

import { extractDocumentText, pdfTextItemsToLines } from "./extract-text";

test("extracts UTF-8 text and markdown uploads", async () => {
  const text = await extractDocumentText({
    bytes: Buffer.from("问题：请介绍项目？\r\n回答：Career Agent"),
    fileName: "interview.md",
    mimeType: "text/markdown",
  });

  assert.equal(text, "问题：请介绍项目？\n回答：Career Agent");
});

function item(str: string, x: number, y: number) {
  return { str, transform: [12, 0, 0, 12, x, y] };
}

test("keeps Chinese fragments on one line without inserting spaces", () => {
  const lines = pdfTextItemsToLines([
    item("面试官：", 50, 700),
    item("请介绍一下", 110, 700),
    item("你负责的项目？", 190, 700),
  ]);
  // PDF 会把一句话拆成多段，拼接时不能凭空加空格，否则逐字定位会失败。
  assert.deepEqual(lines, ["面试官：请介绍一下你负责的项目？"]);
});

test("still separates Latin words that arrive as separate fragments", () => {
  const lines = pdfTextItemsToLines([
    item("Tell me", 50, 700),
    item("about", 120, 700),
    item("your project", 170, 700),
  ]);
  assert.deepEqual(lines, ["Tell me about your project"]);
});

test("does not add a space between Chinese text and adjacent Latin fragments", () => {
  const lines = pdfTextItemsToLines([
    item("我用了", 50, 700),
    item("Redis", 100, 700),
    item("做缓存", 150, 700),
  ]);
  assert.deepEqual(lines, ["我用了Redis做缓存"]);
});

test("orders rows top-down and fragments left-to-right", () => {
  const lines = pdfTextItemsToLines([
    item("第二行", 50, 600),
    item("答：", 50, 660),
    item("我负责重构", 90, 660),
  ]);
  assert.deepEqual(lines, ["答：我负责重构", "第二行"]);
});

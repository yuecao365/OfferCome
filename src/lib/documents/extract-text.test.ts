import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  extractDocumentText,
  pdfjsAssetDirectory,
  pdfTextItemsToLines,
} from "./extract-text";

/**
 * pdfjs 在 Node 下用 fs.readFile(目录 + 文件名) 读 CMap。传 file:// 地址会让
 * 中文字体依赖的预定义 CMap 全部加载失败，汉字整体丢失而英文完好，很难察觉。
 * 这里按 pdfjs 的读取方式验证目录真的可读。
 */
test("pdfjs asset directories are filesystem paths pdfjs can read", () => {
  for (const name of ["cmaps", "standard_fonts"] as const) {
    const directory = pdfjsAssetDirectory(name);
    assert.ok(directory.endsWith("/"), "pdfjs 要求以正斜杠结尾");
    assert.ok(!/^[a-z]+:\/\//i.test(directory), "必须是路径而不是 URL");
  }
  assert.ok(
    existsSync(`${pdfjsAssetDirectory("cmaps")}Adobe-GB1-UCS2.bcmap`),
    "简体中文字体依赖的 Adobe-GB1 CMap 必须能按此路径读到",
  );
});

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

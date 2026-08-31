import path from "node:path";
import { pathToFileURL } from "node:url";

import { ensureDomMatrix } from "./dom-matrix-polyfill";

type PdfTextItem = {
  str: string;
  transform?: number[];
};

type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
    cleanup(): void;
  }>;
  destroy(): Promise<void>;
};

type PdfJsModule = {
  getDocument(options: unknown): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

export type DocumentTextInput = {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof (item as { str?: unknown }).str === "string"
  );
}

const CJK_BOUNDARY_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯]/u;

/**
 * PDF 的一行文字会被拆成多个片段。中文之间本来没有空格，无条件用空格拼接
 * 会往原文里插入并不存在的空格，后续按原文逐字定位问答边界时就会全部落空。
 */
function joinPdfFragments(fragments: string[]): string {
  return fragments.reduce((line, fragment) => {
    if (!line) return fragment;
    const left = line.at(-1) ?? "";
    const right = fragment.at(0) ?? "";
    const needsSpace =
      !CJK_BOUNDARY_PATTERN.test(left) && !CJK_BOUNDARY_PATTERN.test(right);
    return needsSpace ? `${line} ${fragment}` : line + fragment;
  }, "");
}

export function pdfTextItemsToLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; items: { x: number; text: string }[] }[] = [];

  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;

    const transform = item.transform ?? [];
    const x = typeof transform[4] === "number" ? transform[4] : 0;
    const y = typeof transform[5] === "number" ? transform[5] : 0;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2);

    if (row) row.items.push({ x, text });
    else rows.push({ y, items: [{ x, text }] });
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) =>
      joinPdfFragments(
        row.items.sort((left, right) => left.x - right.x).map((item) => item.text),
      )
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function directoryUrl(...segments: string[]): string {
  return `${pathToFileURL(path.join(...segments)).href}/`;
}

async function importPdfjsRuntime(): Promise<PdfJsModule> {
  // pdfjs 在模块顶层就会构造 DOMMatrix，必须先于 import 补齐。
  ensureDomMatrix();
  const moduleUrl = pathToFileURL(
    path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.mjs",
    ),
  ).href;
  const importer = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<PdfJsModule>;
  return importer(moduleUrl);
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await importPdfjsRuntime();
  GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    ),
  ).href;

  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useWorkerFetch: false,
    cMapUrl: directoryUrl(process.cwd(), "node_modules", "pdfjs-dist", "cmaps"),
    cMapPacked: true,
    standardFontDataUrl: directoryUrl(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "standard_fonts",
    ),
    verbosity: 0,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const textItems = (content.items as unknown[]).filter(isPdfTextItem);
        pages.push(pdfTextItemsToLines(textItems).join("\n"));
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await document.destroy();
  }

  return pages.join("\n\n");
}

function extractPrintableText(buffer: Buffer): string {
  return buffer
    .toString("utf8")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export async function extractDocumentText({
  bytes,
  fileName,
  mimeType,
}: DocumentTextInput): Promise<string> {
  const extension = path.extname(fileName).toLowerCase();
  const normalizedMimeType = mimeType.toLowerCase();

  if (
    normalizedMimeType.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp"].includes(extension)
  ) {
    return "";
  }

  if (normalizedMimeType === "application/pdf" || extension === ".pdf") {
    return extractPdfText(bytes);
  }

  if (extension === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    return (result.value ?? "").trim();
  }

  return extractPrintableText(bytes);
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  RESUME_MAX_SIZE_BYTES,
  assertPathInsideResumeDir,
  promoteTemporaryResumeFile,
  saveTemporaryResumeFile,
  validateResumeUpload,
} from "./storage";

test("validates supported resume uploads", () => {
  const result = validateResumeUpload({
    originalName: "frontend-resume.PDF",
    mimeType: "application/pdf",
    fileSize: 128_000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.extension, ".pdf");
});

test("validates supported image resume uploads", () => {
  const jpeg = validateResumeUpload({
    originalName: "resume-photo.JPG",
    mimeType: "image/jpeg",
    fileSize: 128_000,
  });
  const png = validateResumeUpload({
    originalName: "resume-scan.png",
    mimeType: "image/png",
    fileSize: 128_000,
  });
  const webp = validateResumeUpload({
    originalName: "resume-scan.webp",
    mimeType: "image/webp",
    fileSize: 128_000,
  });

  assert.equal(jpeg.ok, true);
  assert.equal(jpeg.extension, ".jpg");
  assert.equal(jpeg.normalizedMimeType, "image/jpeg");
  assert.equal(png.ok, true);
  assert.equal(png.extension, ".png");
  assert.equal(webp.ok, true);
  assert.equal(webp.extension, ".webp");
});

test("rejects unsupported resume extensions and oversized files", () => {
  const unsupported = validateResumeUpload({
    originalName: "resume.txt",
    mimeType: "text/plain",
    fileSize: 100,
  });
  const oversized = validateResumeUpload({
    originalName: "resume.pdf",
    mimeType: "application/pdf",
    fileSize: RESUME_MAX_SIZE_BYTES + 1,
  });

  assert.equal(unsupported.ok, false);
  assert.equal(oversized.ok, false);
});

test("prevents resume file path traversal outside upload directory", () => {
  const root = path.resolve("C:/safe/resumes");
  const safePath = assertPathInsideResumeDir(
    path.join(root, "stored.pdf"),
    root,
  );

  assert.equal(safePath, path.join(root, "stored.pdf"));
  assert.throws(
    () => assertPathInsideResumeDir(path.resolve(root, "..", "secret.pdf"), root),
    /outside the resume upload directory/,
  );
});

test("saves resume uploads temporarily before promoting to permanent storage", async () => {
  const file = new File(["hello"], "resume.pdf", { type: "application/pdf" });
  const temporary = await saveTemporaryResumeFile(file);

  assert.equal(temporary.originalName, "resume.pdf");
  assert.match(temporary.tempUploadId, /^[a-f0-9-]+$/);
  assert.equal(await fileExists(temporary.filePath), true);

  const stored = await promoteTemporaryResumeFile(temporary.tempUploadId);

  assert.equal(stored.originalName, "resume.pdf");
  assert.equal(await fileExists(stored.filePath), true);
  assert.equal(await fileExists(temporary.filePath), false);

  await fs.unlink(stored.filePath);
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

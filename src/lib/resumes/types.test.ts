import assert from "node:assert/strict";
import test from "node:test";

import {
  canPreviewResumeInline,
  resumePreviewKind,
  resumeTypeLabel,
} from "./types";

test("marks uploaded resume images as inline previewable", () => {
  assert.equal(canPreviewResumeInline("image/jpeg", "resume.jpg"), true);
  assert.equal(canPreviewResumeInline("image/png", "resume.png"), true);
  assert.equal(canPreviewResumeInline("image/webp", "resume.webp"), true);
  assert.equal(resumePreviewKind("image/jpeg", "resume.jpg"), "image");
});

test("labels supported image resume files", () => {
  assert.equal(resumeTypeLabel("image/jpeg", "resume.jpg"), "JPEG 图片");
  assert.equal(resumeTypeLabel("image/png", "resume.png"), "PNG 图片");
  assert.equal(resumeTypeLabel("image/webp", "resume.webp"), "WebP 图片");
});

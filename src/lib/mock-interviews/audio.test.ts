import assert from "node:assert/strict";
import test from "node:test";

import { pickRecordingMediaType, recordingFileExtension } from "./audio";

test("prefers Opus WebM when the browser supports it", () => {
  assert.equal(
    pickRecordingMediaType((mediaType) => mediaType !== "audio/mp4"),
    "audio/webm;codecs=opus",
  );
});

test("falls back to MP4 and chooses a matching extension", () => {
  assert.equal(
    pickRecordingMediaType((mediaType) => mediaType === "audio/mp4"),
    "audio/mp4",
  );
  assert.equal(recordingFileExtension("audio/mp4"), "m4a");
  assert.equal(recordingFileExtension("audio/webm;codecs=opus"), "webm");
});

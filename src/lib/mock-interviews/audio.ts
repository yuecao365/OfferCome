const MOCK_INTERVIEW_RECORDING_MEDIA_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export function pickRecordingMediaType(
  isTypeSupported: (mediaType: string) => boolean,
): string | undefined {
  return MOCK_INTERVIEW_RECORDING_MEDIA_TYPES.find(isTypeSupported);
}

export function recordingFileExtension(mediaType: string): "m4a" | "webm" {
  return mediaType.toLowerCase().startsWith("audio/mp4") ? "m4a" : "webm";
}

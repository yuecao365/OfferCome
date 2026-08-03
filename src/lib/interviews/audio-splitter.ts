import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

import type { AudioTranscriptionInput } from "./transcription";

const execFileAsync = promisify(execFile);
const MAX_FFMPEG_OUTPUT_BYTES = 8 * 1024 * 1024;

export async function splitAudioIntoChunks(
  input: AudioTranscriptionInput,
  chunkDurationSeconds: number,
): Promise<AudioTranscriptionInput[]> {
  const workingDirectory = await mkdtemp(
    path.join(tmpdir(), "career-agent-audio-"),
  );
  const inputPath = path.join(workingDirectory, "input-audio");
  const outputPattern = path.join(workingDirectory, "chunk-%03d.wav");

  try {
    await writeFile(inputPath, input.bytes);
    await execFileAsync(
      ffmpegInstaller.path,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "segment",
        "-segment_time",
        String(chunkDurationSeconds),
        "-reset_timestamps",
        "1",
        "-c:a",
        "pcm_s16le",
        outputPattern,
      ],
      { maxBuffer: MAX_FFMPEG_OUTPUT_BYTES },
    );

    const chunkNames = (await readdir(workingDirectory))
      .filter((name) => name.startsWith("chunk-") && name.endsWith(".wav"))
      .sort();
    if (chunkNames.length === 0) {
      throw new Error("FFmpeg 没有生成可转写的音频片段。");
    }

    return Promise.all(
      chunkNames.map(async (name) => ({
        bytes: new Uint8Array(await readFile(path.join(workingDirectory, name))),
        mediaType: "audio/wav",
      })),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    throw new Error(`录音自动切分失败：${detail}`, { cause: error });
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

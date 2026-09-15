"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { pickRecordingMediaType, recordingFileExtension } from "@/lib/mock-interviews/audio";

/**
 * 语音模式的作答：录一段 → 转写 → 交给房间作为这回合的回答（连同语音指标）。
 * 开始录音就停掉面试官的朗读（打断的最小实现）。音频只用于转写，不保存。
 */

type RecordingPhase = "idle" | "requesting" | "recording" | "transcribing";

const MAX_RECORDING_MS = 5 * 60_000;

export type VoiceTranscript = { transcript: string; voiceMetricsJson: string | null };

type MockInterviewVoiceControlsProps = {
  disabled: boolean;
  sessionId: string;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
  onTranscript: (result: VoiceTranscript) => void;
};

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function MockInterviewVoiceControls({ disabled, sessionId, onBusyChange, onError, onTranscript }: MockInterviewVoiceControlsProps) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordingNotice, setRecordingNotice] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const setRecordingPhase = useCallback(
    (nextPhase: RecordingPhase) => {
      setPhase(nextPhase);
      onBusyChange(nextPhase !== "idle");
    },
    [onBusyChange],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      stopStream(streamRef.current);
      onBusyChange(false);
    };
  }, [onBusyChange]);

  const transcribe = useCallback(
    async (blob: Blob, mediaType: string) => {
      setRecordingPhase("transcribing");
      try {
        const formData = new FormData();
        formData.append("audio", new File([blob], `answer.${recordingFileExtension(mediaType)}`, { type: mediaType }));
        const response = await fetch(`/api/interviews/mock/${sessionId}/transcribe`, { method: "POST", body: formData });
        const result = (await response.json()) as { transcript?: string; voiceMetricsJson?: string | null; error?: string };
        if (!response.ok || !result.transcript?.trim()) throw new Error(result.error ?? "回答录音转写失败。");
        if (mountedRef.current) onTranscript({ transcript: result.transcript.trim(), voiceMetricsJson: result.voiceMetricsJson ?? null });
      } catch (error) {
        if (mountedRef.current) onError(error instanceof Error ? error.message : "回答录音转写失败。");
      } finally {
        if (mountedRef.current) setRecordingPhase("idle");
      }
    },
    [onError, onTranscript, sessionId, setRecordingPhase],
  );

  const startRecording = async () => {
    onError("");
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      onError("当前浏览器不支持录音，请用文字作答或更换浏览器。");
      return;
    }
    setRecordingPhase("requesting");
    // 打断：候选人开口就不再朗读面试官的话。
    window.speechSynthesis?.cancel();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaType = pickRecordingMediaType(MediaRecorder.isTypeSupported);
      const recorder = mediaType ? new MediaRecorder(stream, { mimeType: mediaType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => onError("录音失败，请检查麦克风权限后重试。");
      recorder.onstop = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        recordingStartedAtRef.current = null;
        stopStream(streamRef.current);
        streamRef.current = null;
        const finalType = recorder.mimeType || mediaType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalType });
        chunksRef.current = [];
        if (blob.size === 0) {
          setRecordingPhase("idle");
          onError("没有录到可用音频，请重试。");
          return;
        }
        void transcribe(blob, finalType);
      };
      recorder.start(1_000);
      setElapsedSeconds(0);
      setRecordingNotice("");
      recordingStartedAtRef.current = Date.now();
      setRecordingPhase("recording");
      intervalRef.current = setInterval(() => {
        if (recordingStartedAtRef.current !== null) {
          setElapsedSeconds(Math.min(MAX_RECORDING_MS / 1_000, Math.floor((Date.now() - recordingStartedAtRef.current) / 1_000)));
        }
      }, 1_000);
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          setElapsedSeconds(MAX_RECORDING_MS / 1_000);
          setRecordingNotice("已达单次录音上限，已自动停止并开始转写");
          recorder.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setRecordingPhase("idle");
      onError(error instanceof DOMException && error.name === "NotAllowedError" ? "未获得麦克风权限，请在浏览器地址栏允许后重试。" : "无法启动录音，请检查麦克风后重试。");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const busy = phase !== "idle";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedRemainder = String(elapsedSeconds % 60).padStart(2, "0");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-subtle px-3 py-2">
      {phase === "recording" ? (
        <>
          <Button onClick={stopRecording} size="sm" type="button" variant="danger">
            <Square aria-hidden="true" className="size-3.5" />
            说完了，发送
          </Button>
          <span className={elapsedSeconds >= 270 ? "text-sm font-semibold text-warning-strong" : "text-sm font-medium text-foreground"}>
            {elapsedMinutes}:{elapsedRemainder} / 5:00
          </span>
        </>
      ) : (
        <Button disabled={disabled || busy} onClick={startRecording} size="sm" type="button">
          {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Mic aria-hidden="true" className="size-4" />}
          {phase === "requesting" ? "正在请求麦克风" : phase === "transcribing" ? "正在转写" : "按下开始回答"}
        </Button>
      )}
      <p aria-live="polite" className="text-xs leading-5 text-muted-foreground">
        {phase === "recording" ? "正在录音，说完点发送；单次最长 5 分钟。" : phase === "transcribing" ? "录音只用于转写，不保存音频。" : "转写好的文字直接作为这回合的回答发出；也可以在下面打字。"}
      </p>
      <p aria-live="assertive" className="sr-only">
        {recordingNotice}
      </p>
    </div>
  );
}

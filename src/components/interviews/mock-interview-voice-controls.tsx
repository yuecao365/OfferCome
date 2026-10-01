"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { pickRecordingMediaType, recordingFileExtension } from "@/lib/mock-interviews/audio";

const messages = defineMessages({
  "zh-CN": {
    transcribeFailed: "回答录音转写失败。",
    unsupported: "当前浏览器不支持录音，请用文字作答或更换浏览器。",
    recordFailed: "录音失败，请检查麦克风权限后重试。",
    noAudio: "没有录到可用音频，请重试。",
    limitReached: "已达单次录音上限，已自动停止并开始转写",
    permissionDenied: "未获得麦克风权限，请在浏览器地址栏允许后重试。",
    cannotStart: "无法启动录音，请检查麦克风后重试。",
    stop: "说完了，转成文字",
    requesting: "正在请求麦克风",
    transcribing: "正在转写",
    speak: "说话输入",
    recordingHint: "正在录音，说完点转写；单次最长 5 分钟。",
    transcribingHint: "录音只用于转写，不保存音频。",
    idleHint: "转写好的文字会进输入框，改好再发。",
  },
  en: {
    transcribeFailed: "Couldn't transcribe your recording.",
    unsupported: "This browser can't record audio. Type your answer or switch browsers.",
    recordFailed: "Recording failed. Check microphone permission and try again.",
    noAudio: "No usable audio was recorded. Try again.",
    limitReached: "Reached the recording limit, stopped and transcribing",
    permissionDenied: "Microphone access wasn't granted. Allow it from the browser address bar and try again.",
    cannotStart: "Couldn't start recording. Check your microphone and try again.",
    stop: "Done, transcribe",
    requesting: "Requesting microphone",
    transcribing: "Transcribing",
    speak: "Speak",
    recordingHint: "Recording. Click transcribe when you're done; up to 5 minutes each time.",
    transcribingHint: "Audio is used only for transcription and isn't saved.",
    idleHint: "The transcript goes into the input box so you can edit it before sending.",
  },
});

/**
 * 麦克风输入：录一段 → 转写 → 把文字交回输入框（候选人可以改再发）。音频只用于转写，不保存。
 * 面试没有语音模式，这只是打字之外的另一种输入。
 */

type RecordingPhase = "idle" | "requesting" | "recording" | "transcribing";

const MAX_RECORDING_MS = 5 * 60_000;



type MockInterviewVoiceControlsProps = {
  disabled: boolean;
  sessionId: string;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
  onTranscript: (transcript: string) => void;
};

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function MockInterviewVoiceControls({ disabled, sessionId, onBusyChange, onError, onTranscript }: MockInterviewVoiceControlsProps) {
  const t = useMessages(messages);
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
        const result = (await response.json()) as { transcript?: string; error?: string };
        if (!response.ok || !result.transcript?.trim()) throw new Error(result.error ?? t.transcribeFailed);
        if (mountedRef.current) onTranscript(result.transcript.trim());
      } catch (error) {
        if (mountedRef.current) onError(error instanceof Error ? error.message : t.transcribeFailed);
      } finally {
        if (mountedRef.current) setRecordingPhase("idle");
      }
    },
    [onError, onTranscript, sessionId, setRecordingPhase, t],
  );

  const startRecording = async () => {
    onError("");
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      onError(t.unsupported);
      return;
    }
    setRecordingPhase("requesting");
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
      recorder.onerror = () => onError(t.recordFailed);
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
          onError(t.noAudio);
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
          setRecordingNotice(t.limitReached);
          recorder.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setRecordingPhase("idle");
      onError(error instanceof DOMException && error.name === "NotAllowedError" ? t.permissionDenied : t.cannotStart);
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
            {t.stop}
          </Button>
          <span className={elapsedSeconds >= 270 ? "text-sm font-semibold text-warning-strong" : "text-sm font-medium text-foreground"}>
            {elapsedMinutes}:{elapsedRemainder} / 5:00
          </span>
        </>
      ) : (
        <Button disabled={disabled || busy} onClick={startRecording} size="sm" type="button">
          {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Mic aria-hidden="true" className="size-4" />}
          {phase === "requesting" ? t.requesting : phase === "transcribing" ? t.transcribing : t.speak}
        </Button>
      )}
      <p aria-live="polite" className="text-xs leading-5 text-muted-foreground">
        {phase === "recording" ? t.recordingHint : phase === "transcribing" ? t.transcribingHint : t.idleHint}
      </p>
      <p aria-live="assertive" className="sr-only">
        {recordingNotice}
      </p>
    </div>
  );
}

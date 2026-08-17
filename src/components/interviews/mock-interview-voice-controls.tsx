"use client";

import { LoaderCircle, Mic, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  pickRecordingMediaType,
  recordingFileExtension,
} from "@/lib/mock-interviews/audio";

type RecordingPhase = "idle" | "requesting" | "recording" | "transcribing";

const MAX_RECORDING_MS = 10 * 60_000;

type MockInterviewVoiceControlsProps = {
  disabled: boolean;
  question: string;
  questionId: string;
  sessionId: string;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
  onTranscript: (transcript: string) => void;
};

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function MockInterviewVoiceControls({
  disabled,
  question,
  questionId,
  sessionId,
  onBusyChange,
  onError,
  onTranscript,
}: MockInterviewVoiceControlsProps) {
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

  const speakQuestion = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      onError("当前浏览器不支持问题朗读，请切换文字模式或更换浏览器。");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(question);
    utterance.lang = /[\u3400-\u9fff]/u.test(question) ? "zh-CN" : "en-US";
    utterance.rate = 0.95;
    const language = utterance.lang.toLowerCase().slice(0, 2);
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith(language));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }, [onError, question]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(speakQuestion, 150);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
      window.speechSynthesis?.cancel();
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
  }, [onBusyChange, speakQuestion]);

  const transcribe = useCallback(
    async (blob: Blob, mediaType: string) => {
      setRecordingPhase("transcribing");
      try {
        const extension = recordingFileExtension(mediaType);
        const formData = new FormData();
        formData.append(
          "audio",
          new File([blob], `answer.${extension}`, { type: mediaType }),
        );
        formData.append("questionId", questionId);
        const response = await fetch(
          `/api/interviews/mock/${sessionId}/transcribe`,
          { method: "POST", body: formData },
        );
        const result = (await response.json()) as {
          transcript?: string;
          error?: string;
        };
        if (!response.ok || !result.transcript?.trim()) {
          throw new Error(result.error ?? "回答录音转写失败。");
        }
        if (mountedRef.current) onTranscript(result.transcript.trim());
      } catch (error) {
        if (mountedRef.current) {
          onError(error instanceof Error ? error.message : "回答录音转写失败。");
        }
      } finally {
        if (mountedRef.current) setRecordingPhase("idle");
      }
    },
    [onError, onTranscript, questionId, sessionId, setRecordingPhase],
  );

  const startRecording = async () => {
    onError("");
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      onError("当前浏览器不支持录音，请切换文字模式或更换浏览器。");
      return;
    }

    setRecordingPhase("requesting");
    window.speechSynthesis?.cancel();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaType = pickRecordingMediaType(MediaRecorder.isTypeSupported);
      const recorder = mediaType
        ? new MediaRecorder(stream, { mimeType: mediaType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        onError("录音失败，请检查麦克风权限后重试。");
      };
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
          setElapsedSeconds(
            Math.min(
              MAX_RECORDING_MS / 1_000,
              Math.floor((Date.now() - recordingStartedAtRef.current) / 1_000),
            ),
          );
        }
      }, 1_000);
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          setElapsedSeconds(MAX_RECORDING_MS / 1_000);
          setRecordingNotice(
            "已达单次录音上限，已自动停止并开始转写",
          );
          recorder.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setRecordingPhase("idle");
      onError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "未获得麦克风权限，请在浏览器地址栏允许后重试。"
          : "无法启动录音，请检查麦克风后重试。",
      );
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
    <div className="grid gap-2 rounded-lg border border-border bg-surface-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disabled || busy}
          onClick={speakQuestion}
          size="sm"
          type="button"
          variant="outline"
        >
          <Volume2 aria-hidden="true" className="size-4" />
          朗读问题
        </Button>
        {phase === "recording" ? (
          <>
            <Button onClick={stopRecording} size="sm" type="button" variant="danger">
              <Square aria-hidden="true" className="size-3.5" />
              结束录音
            </Button>
            <span
              className={
                elapsedSeconds >= 270
                  ? "text-sm font-semibold text-warning-strong"
                  : "text-sm font-medium text-foreground"
              }
            >
              {elapsedMinutes}:{elapsedRemainder} / 5:00
            </span>
          </>
        ) : (
          <Button
            disabled={disabled || busy}
            onClick={startRecording}
            size="sm"
            type="button"
          >
            {busy ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Mic aria-hidden="true" className="size-4" />
            )}
            {phase === "requesting"
              ? "正在请求麦克风"
              : phase === "transcribing"
                ? "正在转写"
                : "开始录音"}
          </Button>
        )}
      </div>
      <p aria-live="polite" className="text-xs leading-5 text-muted-foreground">
        {phase === "recording"
          ? "正在录音，完成后点击结束。单次最长 5 分钟。"
          : phase === "transcribing"
            ? "录音仅用于本次转写，不保存音频文件。"
            : "录音会转成可编辑文字，确认内容后再提交回答。"}
      </p>
      <p aria-live="assertive" className="sr-only">
        {recordingNotice}
      </p>
    </div>
  );
}

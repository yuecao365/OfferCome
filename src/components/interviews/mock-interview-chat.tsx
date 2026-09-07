"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isDataUIPart, isTextUIPart } from "ai";
import { Loader2, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CANDIDATE_INTENT_PLACEHOLDERS } from "@/lib/mock-interviews/interviewer/actions";
import type {
  MockInterviewConversation,
  MockInterviewConversationMessage,
  MockInterviewView,
} from "@/lib/mock-interviews/types";

import { MockInterviewReport } from "./mock-interview-report";

/**
 * 对话式面试房间。面试官的话经流式返回，流结束时服务端把真正落库的消息以
 * data-turn 数据块交回，前端用它替换流中的临时内容——真相始终在服务端。
 */

type Intent = "skip" | "hint" | "repeat" | "end";

type TurnBody =
  | { kind: "start" }
  | { kind: "message"; clientId: string; content: string; intent: Intent | null };

type TurnData = {
  messages: MockInterviewConversationMessage[];
  phase: MockInterviewConversation["phase"] | null;
  threads: MockInterviewConversation["threads"] | null;
  effects: string[];
  replay: boolean;
};

const AREA_KIND_LABELS: Record<string, string> = {
  technical: "技术",
  project: "项目",
  behavioral: "行为",
};

const AREA_STATUS_LABELS: Record<string, string> = {
  pending: "未考察",
  active: "进行中",
  covered: "已考察",
};

function areaStatuses(
  areas: MockInterviewConversation["areas"],
  threads: MockInterviewConversation["threads"],
): MockInterviewConversation["areas"] {
  return areas.map((area) => {
    const own = threads.filter((thread) => thread.areaId === area.id);
    return {
      ...area,
      depthReached: Math.max(0, ...own.map((thread) => thread.depth)),
      status: own.some((thread) => thread.status === "active")
        ? "active"
        : own.length > 0
          ? "covered"
          : "pending",
    };
  });
}

function Bubble({ message }: { message: MockInterviewConversationMessage }) {
  const interviewer = message.role === "interviewer";
  return (
    <div className={interviewer ? "flex justify-start" : "flex justify-end"}>
      <div
        className={
          interviewer
            ? "max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground"
            : "max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-sm leading-6 text-accent-foreground"
        }
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export function MockInterviewChat({
  session,
}: {
  session: MockInterviewView & { conversation: MockInterviewConversation };
}) {
  const router = useRouter();
  const conversation = session.conversation;
  const [transcript, setTranscript] = useState(conversation.messages);
  const [threads, setThreads] = useState(conversation.threads);
  const [phase, setPhase] = useState(conversation.phase);
  const [input, setInput] = useState("");
  const [turnError, setTurnError] = useState("");
  const [completing, setCompleting] = useState(false);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({ api: `/api/interviews/mock/${session.id}/turn` }),
    [session.id],
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
    onFinish: ({ message }) => {
      const part = message.parts.find(
        (item) => isDataUIPart(item) && item.type === "data-turn",
      );
      const data = part && "data" in part ? (part.data as TurnData) : null;
      if (data) {
        setTranscript((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...data.messages.filter((item) => !known.has(item.id))];
        });
        if (data.threads) setThreads(data.threads);
        if (data.phase) setPhase(data.phase);
      }
      setMessages([]);
    },
    onError: (caught) => {
      setTurnError(caught instanceof Error ? caught.message : "回合失败，请重试。");
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const ended = phase === "ended" || session.status !== "in_progress";
  const areas = useMemo(() => areaStatuses(conversation.areas, threads), [conversation.areas, threads]);
  const turnsUsed = transcript.reduce((max, message) => Math.max(max, message.turnIndex + 1), 0);

  // 只显示当前步骤的文本：模型在工具调用后常再说一步，并把前一步复述一遍。
  const streamingText = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.role === "assistant");
    let text = "";
    for (const part of last?.parts ?? []) {
      if (part.type === "step-start") text = "";
      else if (isTextUIPart(part)) text += part.text;
    }
    return text;
  }, [messages]);

  const send = useCallback(
    (content: string, intent: Intent | null) => {
      const trimmed = content.trim();
      if (!trimmed && !intent) return;
      const clientId = crypto.randomUUID();
      const text = trimmed || (intent ? CANDIDATE_INTENT_PLACEHOLDERS[intent] : "");
      const body: TurnBody = { kind: "message", clientId, content: trimmed, intent };
      setTurnError("");
      setTranscript((current) => [
        ...current,
        {
          id: `local-${clientId}`,
          turnIndex: turnsUsed,
          role: "candidate",
          kind: "answer",
          content: text,
          threadId: null,
        },
      ]);
      setInput("");
      void sendMessage({ text }, { body });
    },
    [sendMessage, turnsUsed],
  );

  // 开场：房间第一次打开、还没有任何消息时，由面试官先说话。
  useEffect(() => {
    if (startedRef.current || ended || transcript.length > 0 || busy) return;
    startedRef.current = true;
    const body: TurnBody = { kind: "start" };
    void sendMessage({ text: "（开始面试）" }, { body });
  }, [busy, ended, sendMessage, transcript.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, streamingText]);

  // 评分中：轮询直到报告出现。
  useEffect(() => {
    if (session.status !== "evaluating") return;
    const timer = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [router, session.status]);

  async function complete() {
    setCompleting(true);
    setTurnError("");
    try {
      const response = await fetch(`/api/interviews/mock/${session.id}/complete`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "生成面试报告失败。");
      router.refresh();
    } catch (caught) {
      setTurnError(caught instanceof Error ? caught.message : "生成面试报告失败。");
    } finally {
      setCompleting(false);
    }
  }

  if (session.status === "completed" && session.report) {
    return (
      <div className="grid gap-6">
        <MockInterviewReport session={session} />
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">对话记录</summary>
          <div className="mt-4 grid gap-3">
            {transcript.map((message) => (
              <Bubble key={message.id} message={message} />
            ))}
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      {/* 聊天窗口固定为视口高度：消息在窗口内滚动，输入框始终可见。 */}
      <Card className="flex h-[calc(100dvh-13.5rem)] min-h-[26rem] min-w-0 flex-col p-0">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" ref={scrollRef}>
          {transcript.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
          {busy ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground">
                {streamingText ? (
                  <p className="whitespace-pre-wrap">{streamingText}</p>
                ) : (
                  <Loader2 aria-label="面试官正在思考" className="size-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          ) : null}
        </div>

        {turnError || error ? (
          <div className="px-4 pb-2">
            <Alert tone="danger">{turnError || error?.message}</Alert>
          </div>
        ) : null}

        {ended ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
            <p className="text-sm text-muted-foreground">
              {session.status === "evaluating" ? "正在评分，报告很快就好。" : "面试已结束。"}
            </p>
            {session.status === "ready_to_evaluate" ? (
              <Button disabled={completing} onClick={complete} type="button">
                {completing ? "生成中…" : "生成面试报告"}
              </Button>
            ) : null}
          </div>
        ) : (
          <form
            className="grid gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              send(input, null);
            }}
          >
            <textarea
              aria-label="你的回答"
              className="min-h-20 w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring/20"
              disabled={busy}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send(input, null);
                }
              }}
              placeholder="像面试时那样回答；Enter 发送，Shift+Enter 换行。"
              value={input}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy || !input.trim()} type="submit">
                <SendHorizontal aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                发送
              </Button>
              <Button disabled={busy} onClick={() => send("", "hint")} size="sm" type="button" variant="outline">
                要个提示
              </Button>
              <Button disabled={busy} onClick={() => send("", "repeat")} size="sm" type="button" variant="outline">
                再说一遍
              </Button>
              <Button disabled={busy} onClick={() => send("", "skip")} size="sm" type="button" variant="ghost">
                跳过这题
              </Button>
              <Button
                className="ml-auto text-danger hover:bg-danger-soft hover:text-danger-strong"
                disabled={busy}
                onClick={() => {
                  const covered = areas.filter((area) => area.status === "covered").length;
                  if (window.confirm(`确定现在结束吗？已考察 ${covered}/${areas.length} 个领域，未考察的不计分，结束后进入评分。`)) send("", "end");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                结束面试
              </Button>
            </div>
          </form>
        )}
      </Card>

      <aside className="grid min-w-0 content-start gap-3">
        <Card className="min-w-0 p-4">
          <p className="text-xs font-semibold text-muted-foreground">考察领域</p>
          <ol className="mt-3 grid gap-2">
            {areas.map((area) => (
              <li className="flex min-w-0 items-start justify-between gap-2 text-sm" key={area.id}>
                <div className="min-w-0">
                  <p className="break-words font-medium leading-5 text-foreground">{area.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {AREA_KIND_LABELS[area.kind] ?? area.kind} · 追问 {area.depthReached}/{area.depth} 层
                  </p>
                </div>
                <span
                  className={
                    area.status === "active"
                      ? "shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs text-brand-foreground"
                      : area.status === "covered"
                        ? "shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success-strong"
                        : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  }
                >
                  {AREA_STATUS_LABELS[area.status]}
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-4 text-xs leading-5 text-muted-foreground">
          <p>
            第 {turnsUsed} 回合 · 预计 {conversation.turnRange.min}–{conversation.turnRange.max} 回合。面试官觉得考察够了会主动收尾，你也可以随时结束。
          </p>
          <p className="mt-1">面试官的笔记与假设在报告页可见。</p>
        </Card>
      </aside>
    </div>
  );
}

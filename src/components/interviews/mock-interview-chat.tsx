"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isDataUIPart, isTextUIPart } from "ai";
import { ArrowLeft, Loader2, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ThemeButton } from "@/components/theme-button";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { CANDIDATE_INTENT_PLACEHOLDERS } from "@/lib/mock-interviews/interviewer/actions";
import type {
  MockInterviewConversation,
  MockInterviewConversationMessage,
  MockInterviewView,
} from "@/lib/mock-interviews/types";

/**
 * 对话式面试房间：独占整个视口，没有应用导航——像真的坐进面试间。
 * 面试官的话经流式返回，流结束时服务端把真正落库的消息以 data-turn 数据块交回，
 * 前端用它替换流中的临时内容——真相始终在服务端。
 *
 * 候选人看不到考察领域和面试官的计划，顶栏只有一个已用时的钟；计划与笔记在报告页揭晓。
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

export function MockInterviewBubble({ message }: { message: MockInterviewConversationMessage }) {
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

/** 面试室的钟：从第一回合开始计时，结束后停住。 */
function ElapsedClock({ startedAt, running }: { startedAt: string | null; running: boolean }) {
  // 只在浏览器里读时钟：服务端渲染没有"现在"，否则首屏会 hydration 不一致。
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!startedAt || now === null) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <p aria-label="已用时" className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
      {mm}:{ss}
    </p>
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
  const [phase, setPhase] = useState(conversation.phase);
  const [input, setInput] = useState("");
  const [turnError, setTurnError] = useState("");
  const [completing, setCompleting] = useState(false);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 开场回合落库前服务端还没有开始时间，先按进入房间的时刻计时。
  const [openedAt] = useState(() => new Date().toISOString());

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/interviews/mock/${session.id}/turn` }),
    [session.id],
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
    onFinish: ({ message }) => {
      const part = message.parts.find((item) => isDataUIPart(item) && item.type === "data-turn");
      const data = part && "data" in part ? (part.data as TurnData) : null;
      if (data) {
        setTranscript((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...data.messages.filter((item) => !known.has(item.id))];
        });
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
        { id: `local-${clientId}`, turnIndex: turnsUsed, role: "candidate", kind: "answer", content: text, threadId: null },
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

  // 评分中：轮询直到报告出现；报告一出现，页面会切回带导航的报告视图。
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

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
        <ButtonLink href="/interviews/mock" size="sm" variant="ghost">
          <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          退出
        </ButtonLink>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {session.companyName} · {session.jobTitle}
        </p>
        <ElapsedClock startedAt={conversation.startedAt ?? openedAt} running={!ended} />
        <ThemeButton />
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4" ref={scrollRef}>
          {transcript.map((message) => (
            <MockInterviewBubble key={message.id} message={message} />
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
          <div className="px-3 pb-2 sm:px-4">
            <Alert tone="danger">{turnError || error?.message}</Alert>
          </div>
        ) : null}

        {ended ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-4 sm:px-4">
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
            className="grid gap-2 border-t border-border p-3 sm:px-4"
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
                  if (window.confirm("确定现在结束吗？结束后进入评分，没问到的内容不计分。")) send("", "end");
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
      </div>
    </div>
  );
}

"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isDataUIPart, type ChatTransport, type UIMessage } from "ai";
import { ArrowLeft, FileText, Loader2, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MockInterviewMaterialsDrawer } from "@/components/interviews/mock-interview-materials";
import { MockInterviewVoiceControls } from "@/components/interviews/mock-interview-voice-controls";
import { ThemeButton } from "@/components/theme-button";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { CONTROL_PLACEHOLDERS } from "@/lib/interview/events";
import type { TurnData } from "@/lib/interview/stream";
import type { ConversationMessage, ProgressSummary, TurnPayload } from "@/lib/interview/views";
import type { MockInterviewConversation, MockInterviewView } from "@/lib/mock-interviews/types";

/**
 * 对话式面试房间：独占整个视口，没有应用导航——像真的坐进面试间。
 * 回合不流式：服务端先把动作校验完、事件落库，再把整句话与回合结果（data-turn）一次交回；
 * 刚到的那句在房间里用打字机显示。本地版真相在数据库，体验版真相在浏览器的会话文档，
 * 差别全部收在注入的 driver 里。
 *
 * 候选人看不到具体的题和面试官的笔记，看得到时间盒（已用 / 总时长）、已用时和"资料"抽屉
 * （简历原文与岗位描述，面试官对质时引用的简历原句在里面高亮）。
 */

type Intent = "skip" | "hint" | "repeat" | "end";

/** 自动生成报告的等待上限：评分最多等 32 s，汇总再 40 s；超过就给重试入口。 */
const REPORT_WAIT_MS = 90_000;
const REPORT_POLL_MS = 3_000;

export type TurnBody =
  | { kind: "start" }
  | { kind: "message"; clientId: string; content: string; intent: Intent | null; composeMs: number | null };

/** 房间的数据通道：本地版打服务端接口，体验版打无状态接口并把结果写进浏览器文档。 */
export type MockInterviewChatDriver = {
  transport: ChatTransport<UIMessage>;
  /** 流结束、回合结果到手（本地版已落库，无需处理；体验版写进会话文档）。 */
  onTurn?: (payload: TurnPayload) => void;
  /**
   * 面试结束后把报告做出来：resolve 表示报告已就绪。
   * 本地版等服务端后台自动交卷（重试时主动请求交卷）；体验版在浏览器里跑评分与汇总。
   */
  finish: (options: { retry: boolean }) => Promise<void>;
};

/** 接口以 JSON 拒绝时（模型不可用、会话已结束）传输层把整个响应体当消息抛出来，取里面的 error。 */
function readableError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : "";
  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {}
  }
  return message || "回合失败，请重试。";
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? fallback);
  return result;
}

/** 本地版：回合走 /turn，报告由服务端自动生成，这里只等它出现。 */
export function createLocalChatDriver(sessionId: string): MockInterviewChatDriver {
  return {
    transport: new DefaultChatTransport({ api: `/api/interviews/mock/${sessionId}/turn` }),
    async finish({ retry }) {
      if (retry) {
        await readJson(await fetch(`/api/interviews/mock/${sessionId}/complete`, { method: "POST" }), "生成面试报告失败。");
        return;
      }
      const startedAt = Date.now();
      while (Date.now() - startedAt < REPORT_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_MS));
        const status = await readJson<{ status: string }>(
          await fetch(`/api/interviews/mock/${sessionId}/status`, { cache: "no-store" }),
          "读取面试状态失败。",
        );
        if (status.status === "completed") return;
      }
      throw new Error("报告生成得比预期慢，可以重试一次。");
    },
  };
}

/** 打字机：整句话一次到达，按字逐个显示；长句加速，总时长不超过 TYPEWRITER_MAX_MS。 */
const TYPEWRITER_CHAR_MS = 35;
const TYPEWRITER_MAX_MS = 4_000;

function useTypewriter(text: string, enabled: boolean, onTick?: () => void): string {
  const [shown, setShown] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) return;
    const step = Math.min(TYPEWRITER_CHAR_MS, TYPEWRITER_MAX_MS / Math.max(1, text.length));
    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }
        onTick?.();
        return current + 1;
      });
    }, step);
    return () => window.clearInterval(timer);
  }, [enabled, onTick, text.length]);
  return enabled ? text.slice(0, shown) : text;
}

/** 按钮替候选人说的固定句 → 系统行文案：这些不是候选人说的话，不该长得像他的发言。 */
const CONTROL_LINES: Record<string, string> = Object.fromEntries(
  Object.entries(CONTROL_PLACEHOLDERS).map(([control, text]) => [text, { skip: "你跳过了这题", repeat: "你请面试官再说一遍", end: "你结束了面试", hint: "你要了一个提示" }[control] ?? "你按了一个按钮"]),
);

export function MockInterviewBubble({ message, typewriter = false, onTick }: { message: ConversationMessage; typewriter?: boolean; onTick?: () => void }) {
  const interviewer = message.role === "interviewer";
  const content = useTypewriter(message.content, typewriter && interviewer, onTick);
  if (!interviewer && message.kind === "control") {
    return <p className="text-center text-xs text-muted-foreground">{CONTROL_LINES[message.content] ?? message.content}</p>;
  }
  return (
    <div className={interviewer ? "flex justify-start" : "flex justify-end"}>
      <div
        className={
          interviewer
            ? "max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground"
            : "max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-sm leading-6 text-accent-foreground"
        }
      >
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

/** 进度：碰过几份材料、备课共几份（含备选，面试官不一定都聊）；由服务端每回合给，结束后也照实显示。 */
function ProgressBar({ progress }: { progress: ProgressSummary }) {
  return (
    <p aria-label="面试进度" className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground" title="备课的材料里聊到了几份；备选材料面试官不一定都聊，不按时间计">
      材料 {progress.covered} / {progress.quota}
    </p>
  );
}

export function MockInterviewChat({
  session,
  driver: injectedDriver,
  onCompleted,
}: {
  session: MockInterviewView & { conversation: MockInterviewConversation };
  /** 体验版注入浏览器实现；缺省是本地版接口。 */
  driver?: MockInterviewChatDriver;
  /** 报告就绪后的刷新方式；缺省重取服务端视图。 */
  onCompleted?: () => void;
}) {
  const router = useRouter();
  const conversation = session.conversation;
  const [transcript, setTranscript] = useState(conversation.messages);
  /** 这次打开房间后才到的面试官消息：用打字机显示（历史消息直接显示）。 */
  const [arrivedIds, setArrivedIds] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState(conversation.phase);
  const [progress, setProgress] = useState(conversation.progress);
  const [input, setInput] = useState("");
  const [turnError, setTurnError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const lastInterviewerAtRef = useRef<number | null>(null);
  /** 上一次发出的回合请求：失败后"重试"原样再发（clientId 不变，服务端按它去重）。 */
  const lastRequestRef = useRef<{ text: string; body: TurnBody } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [voiceBusy, setVoiceBusy] = useState(false);

  const driver = useMemo(() => injectedDriver ?? createLocalChatDriver(session.id), [injectedDriver, session.id]);
  const refresh = useCallback(() => (onCompleted ? onCompleted() : router.refresh()), [onCompleted, router]);

  const { sendMessage, setMessages, status, error } = useChat({
    transport: driver.transport,
    onFinish: ({ message }) => {
      const part = message.parts.find((item) => isDataUIPart(item) && item.type === "data-turn");
      const data = part && "data" in part ? (part.data as TurnData) : null;
      if (data) {
        const arrived = data.replay ? data.messages : data.payload.newMessages.filter((item) => item.role === "interviewer");
        setTranscript((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...arrived.filter((item) => !known.has(item.id))];
        });
        if (!data.replay) setArrivedIds((current) => new Set([...current, ...arrived.map((item) => item.id)]));
        if (!data.replay) {
          setPhase(data.payload.phase);
          setProgress(data.payload.progress);
          driver.onTurn?.(data.payload);
        }
      }
      setMessages([]);
    },
    onError: (caught) => {
      setTurnError(readableError(caught));
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const ended = phase === "ended" || session.status !== "in_progress";
  const turnsUsed = transcript.reduce((max, message) => Math.max(max, message.turnIndex + 1), 0);


  const send = useCallback(
    (content: string, intent: Intent | null) => {
      const trimmed = content.trim();
      if (!trimmed && !intent) return;
      const clientId = crypto.randomUUID();
      const text = trimmed || (intent ? CONTROL_PLACEHOLDERS[intent] : "");
      const composeMs = lastInterviewerAtRef.current ? Math.max(0, Date.now() - lastInterviewerAtRef.current) : null;
      const body: TurnBody = { kind: "message", clientId, content: trimmed, intent, composeMs };
      setTurnError("");
      setTranscript((current) => [
        ...current,
        { id: `local-${clientId}`, turnIndex: turnsUsed, role: "candidate", kind: intent ? "control" : "answer", content: text },
      ]);
      setInput("");
      lastRequestRef.current = { text, body };
      void sendMessage({ text }, { body });
    },
    [sendMessage, turnsUsed],
  );

  const retry = useCallback(() => {
    const last = lastRequestRef.current;
    if (!last) return;
    setTurnError("");
    void sendMessage({ text: last.text }, { body: last.body });
  }, [sendMessage]);

  // 开场：房间第一次打开、还没有任何消息时，由面试官先说话。
  useEffect(() => {
    if (startedRef.current || ended || transcript.length > 0 || busy) return;
    startedRef.current = true;
    const body: TurnBody = { kind: "start" };
    lastRequestRef.current = { text: "（开始面试）", body };
    void sendMessage({ text: "（开始面试）" }, { body });
  }, [busy, ended, sendMessage, transcript.length]);

  const scrollToEnd = useCallback(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), []);
  useEffect(() => {
    scrollToEnd();
  }, [transcript, scrollToEnd]);

  // 面试官刚说完话的时刻：候选人下一条消息的作答时长从这里起算。
  useEffect(() => {
    if (transcript.at(-1)?.role === "interviewer") lastInterviewerAtRef.current = Date.now();
  }, [transcript]);

  const finish = useCallback(
    async (retry: boolean) => {
      setCompleting(true);
      setReportError("");
      try {
        await driver.finish({ retry });
        refresh();
      } catch (caught) {
        setReportError(caught instanceof Error ? caught.message : "生成面试报告失败。");
      } finally {
        setCompleting(false);
      }
    },
    [driver, refresh],
  );

  // 面试一结束就把报告做出来；报告一出现页面会切回带导航的报告视图。
  useEffect(() => {
    if (!ended || finishedRef.current) return;
    finishedRef.current = true;
    void finish(false);
  }, [ended, finish]);

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
        <ProgressBar progress={progress} />
        <Button aria-pressed={materialsOpen} onClick={() => setMaterialsOpen((open) => !open)} size="sm" type="button" variant="ghost">
          <FileText aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          资料
        </Button>
        <ThemeButton />
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <MockInterviewMaterialsDrawer
          materials={session.materials}
          messages={transcript}
          onClose={() => setMaterialsOpen(false)}
          open={materialsOpen}
        />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4" ref={scrollRef}>
          {transcript.map((message) => (
            <MockInterviewBubble key={message.id} message={message} onTick={scrollToEnd} typewriter={arrivedIds.has(message.id)} />
          ))}
          {busy ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground">
                <Loader2 aria-label="面试官正在思考" className="size-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          ) : null}
        </div>

        {turnError || error ? (
          <div className="flex items-start gap-2 px-3 pb-2 sm:px-4">
            <Alert className="min-w-0 flex-1" tone="danger">{turnError || readableError(error)}</Alert>
            {!ended ? (
              <Button disabled={busy} onClick={retry} size="sm" type="button" variant="outline">
                重试
              </Button>
            ) : null}
          </div>
        ) : null}

        {ended ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-4 sm:px-4">
            {completing ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" strokeWidth={1.5} />
            ) : null}
            <p className="text-sm text-muted-foreground">
              {reportError || "面试已结束，正在评分并生成报告。"}
            </p>
            {reportError ? (
              <Button disabled={completing} onClick={() => finish(true)} type="button" variant="outline">
                {completing ? "生成中…" : "重新生成报告"}
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
            <MockInterviewVoiceControls disabled={busy} onBusyChange={setVoiceBusy} onError={setTurnError} onTranscript={(text) => setInput((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text))} sessionId={session.id} />
            <textarea
              aria-label="你的回答"
              className="min-h-20 w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring/20"
              disabled={busy || voiceBusy}
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

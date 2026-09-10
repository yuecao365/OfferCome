"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isDataUIPart, isTextUIPart, type ChatTransport, type UIMessage } from "ai";
import { ArrowLeft, FileText, Loader2, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { MockInterviewMaterialsDrawer } from "@/components/interviews/mock-interview-materials";
import { ThemeButton } from "@/components/theme-button";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { CANDIDATE_INTENT_PLACEHOLDERS } from "@/lib/mock-interviews/interviewer/actions";
import type { TurnData, TurnPayload } from "@/lib/mock-interviews/interviewer/turn-payload";
import type {
  MockInterviewConversation,
  MockInterviewConversationMessage,
  MockInterviewView,
} from "@/lib/mock-interviews/types";

/**
 * 对话式面试房间：独占整个视口，没有应用导航——像真的坐进面试间。
 * 面试官的话经流式返回，流结束时服务端把回合结果以 data-turn 数据块交回，
 * 前端用它替换流中的临时内容。本地版真相在数据库，体验版真相在浏览器的会话文档，
 * 差别全部收在注入的 driver 里。
 *
 * 候选人看不到考察领域和面试官的计划，顶栏只有一个已用时的钟和"资料"抽屉（简历原文与岗位描述，
 * 面试官对质时引用的简历原句在里面高亮）；计划与笔记在报告页揭晓。
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
  // 服务端渲染没有"现在"：首屏（含 hydration）不画钟，挂载后再按秒走。
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!mounted || !startedAt) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <p aria-label="已用时" className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
      {mm}:{ss}
    </p>
  );
}

function subscribeNoop(): () => void {
  return () => {};
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
  const [phase, setPhase] = useState(conversation.phase);
  const [input, setInput] = useState("");
  const [turnError, setTurnError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const lastInterviewerAtRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 开场回合落下前还没有开始时间，先按进入房间的时刻计时。
  const [openedAt] = useState(() => new Date().toISOString());

  const driver = useMemo(() => injectedDriver ?? createLocalChatDriver(session.id), [injectedDriver, session.id]);
  const refresh = useCallback(() => (onCompleted ? onCompleted() : router.refresh()), [onCompleted, router]);

  const { messages, sendMessage, setMessages, status, error } = useChat({
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
        if (!data.replay) {
          setPhase(data.payload.phase);
          driver.onTurn?.(data.payload);
        }
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
      const composeMs = lastInterviewerAtRef.current ? Math.max(0, Date.now() - lastInterviewerAtRef.current) : null;
      const body: TurnBody = { kind: "message", clientId, content: trimmed, intent, composeMs };
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
        <ElapsedClock startedAt={conversation.startedAt ?? openedAt} running={!ended} />
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

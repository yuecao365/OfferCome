"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export type ReplayResult = {
  say: string;
  kind: string;
  action: string | null;
  why: string | null;
  guard: string | null;
  ledger: string | null;
  runId: string | null;
  durationMs: number;
};

/** trace 页每回合的"重放这一步"：用现在的代码与提示词把这回合再跑一次（不落库），把结果摆在原话旁边对照。 */
export function ReplayTurnButton({ sessionId, turnIndex }: { sessionId: string; turnIndex: number }) {
  const [state, setState] = useState<{ pending: boolean; result: ReplayResult | null; error: string | null }>({ pending: false, result: null, error: null });
  const replay = async () => {
    setState({ pending: true, result: null, error: null });
    try {
      const response = await fetch(`/api/interviews/mock/${sessionId}/replay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnIndex }) });
      const json = (await response.json()) as ReplayResult & { error?: string };
      if (!response.ok || json.error) throw new Error(json.error ?? `重放失败（${response.status}）`);
      setState({ pending: false, result: json, error: null });
    } catch (error) {
      setState({ pending: false, result: null, error: error instanceof Error ? error.message : "重放失败" });
    }
  };
  return (
    <div className="grid w-full gap-2">
      <div>
        <Button disabled={state.pending} onClick={replay} size="sm" type="button" variant="outline">
          {state.pending ? "重放中…" : "重放这一步"}
        </Button>
      </div>
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
      {state.result ? (
        <div className="rounded-control border border-dashed border-border px-3 py-2 text-sm leading-6">
          <span className="mr-2 text-xs text-muted-foreground">
            重放 · {state.result.kind}
            {state.result.action ? ` · ${state.result.action}` : ""}
            {state.result.guard ? ` · 重出「${state.result.guard}」` : ""}
            {` · ${(state.result.durationMs / 1000).toFixed(1)}s`}
          </span>
          <span className="whitespace-pre-wrap">{state.result.say}</span>
          {state.result.why ? <p className="mt-1 text-xs text-muted-foreground">理由：{state.result.why}</p> : null}
          {state.result.ledger ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">证据账：{state.result.ledger}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

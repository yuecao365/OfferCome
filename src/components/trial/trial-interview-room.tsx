"use client";

import { CornerDownRight, Loader2, RotateCcw, SkipForward } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/form-controls";
import {
  evaluateAnswer,
  isMissingAiConfig,
  requestFollowUp,
  requestReport,
} from "@/lib/trial/client";
import {
  completeTrialInterview,
  followUpCount,
  insertTrialFollowUp,
  mainQuestionCount,
  pendingEvaluationIndexes,
  recordTrialAnswer,
  recordTrialEvaluation,
  type TrialInterview,
} from "@/lib/trial/interview";

import { TrialReport } from "./trial-report";

/**
 * 体验版面试房间。
 *
 * 与本地版最大的不同：这里由前端驱动整条流程。本地版的逐题评分跑在服务端
 * 的后台任务里（用户无感），体验版没有服务端状态可写，所以评分改成提交后
 * 立即执行、进度对用户可见。
 */
export function TrialInterviewRoom({
  interview,
  onChange,
  onRestart,
}: {
  interview: TrialInterview;
  onChange: (next: TrialInterview) => void;
  onRestart: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"" | "submitting" | "scoring" | "report">("");
  const [error, setError] = useState("");

  const index = interview.currentIndex;
  const question = interview.questions[index];
  const total = interview.questions.length;
  const pending = pendingEvaluationIndexes(interview);

  function fail(caught: unknown, fallback: string) {
    setError(
      isMissingAiConfig(caught)
        ? "模型配置已失效（可能是刷新后丢失）。请重置体验后重新连接。"
        : caught instanceof Error
          ? caught.message
          : fallback,
    );
  }

  /** 提交或跳过一题：记录 → 评分 → 视情况插入追问。 */
  async function submit(skip: boolean) {
    if (!question) return;
    const text = answer.trim();
    if (!skip && !text) {
      setError("请先写下你的回答，或选择跳过这道题。");
      return;
    }

    setError("");
    setBusy("submitting");
    let next = recordTrialAnswer(interview, index, skip ? null : text);

    try {
      if (!skip) {
        setBusy("scoring");
        const evaluation = await evaluateAnswer({
          question,
          answer: text,
          jobTitle: interview.job.jobTitle,
          jobDescription: interview.job.jobDescription,
        });
        next = recordTrialEvaluation(next, index, evaluation);

        // 追问只针对主题目，且受预算限制；失败不打断面试。
        if (question.parentIndex === null) {
          try {
            const followUp = await requestFollowUp({
              question,
              answer: text,
              blueprint: interview.blueprint,
              mainQuestionCount: mainQuestionCount(interview),
              existingFollowUpCount: followUpCount(interview),
            });
            if (followUp) next = insertTrialFollowUp(next, index, followUp);
          } catch {
            // 追问是锦上添花，静默跳过。
          }
        }
      }
      onChange(next);
      setAnswer("");
    } catch (caught) {
      fail(caught, "提交失败，请重试。");
    } finally {
      setBusy("");
    }
  }

  async function generateReport() {
    setError("");
    setBusy("report");
    try {
      const answered = interview.questions.flatMap((item, i) => {
        const evaluation = interview.evaluations[i];
        return interview.answers[i]?.trim() && evaluation
          ? [
              {
                question: item.question,
                score: evaluation.score,
                feedback: evaluation.feedback,
              },
            ]
          : [];
      });
      const report = await requestReport({
        jobTitle: interview.job.jobTitle,
        answered,
        scores: interview.evaluations.map((item) => item?.score ?? 0),
      });
      onChange(completeTrialInterview(interview, report));
    } catch (caught) {
      fail(caught, "生成报告失败，请重试。");
    } finally {
      setBusy("");
    }
  }

  if (interview.status === "completed" && interview.report) {
    return (
      <TrialReport interview={interview} onRestart={onRestart} report={interview.report} />
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>
              {interview.job.companyName} · {interview.job.jobTitle}
            </CardTitle>
            <CardDescription>
              {interview.status === "ready_to_evaluate"
                ? `${total} 道题已全部作答，可以生成报告了。`
                : `第 ${index + 1} / ${total} 题`}
            </CardDescription>
          </div>
          <Button onClick={onRestart} size="sm" variant="outline">
            <RotateCcw aria-hidden="true" className="size-3.5" />
            重新开始
          </Button>
        </CardHeader>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {interview.status === "ready_to_evaluate" ? (
        <Card>
          <CardContent className="grid gap-4">
            {pending.length > 0 ? (
              <Alert tone="info">还有 {pending.length} 道题的评分未完成。</Alert>
            ) : null}
            <div>
              <Button disabled={busy !== ""} onClick={() => void generateReport()}>
                {busy === "report" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {busy === "report" ? "正在生成报告…" : "生成面试报告"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : question ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">
                {question.parentIndex === null ? "主题目" : "追问"}
              </Badge>
              {question.parentIndex !== null ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CornerDownRight aria-hidden="true" className="size-3.5" />
                  基于你上一题的回答
                </span>
              ) : null}
            </div>
            <CardTitle className="mt-2 text-base leading-7">
              {question.question}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Textarea
              disabled={busy !== ""}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="写下你的回答，像真实面试一样先说思路再补细节。"
              rows={9}
              value={answer}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={busy !== ""} onClick={() => void submit(false)}>
                {busy === "submitting" || busy === "scoring" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {busy === "scoring" ? "正在评分…" : "提交回答"}
              </Button>
              <Button
                disabled={busy !== ""}
                onClick={() => void submit(true)}
                variant="outline"
              >
                <SkipForward aria-hidden="true" className="size-4" />
                跳过这题
              </Button>
              <span className="text-xs text-muted-foreground">
                提交后立即逐题评分，可能需要十几秒。
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

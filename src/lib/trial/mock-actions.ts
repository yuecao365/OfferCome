"use client";

import type {
  MockInterviewAnswerOutcome,
  MockInterviewRoomTransport,
} from "@/components/interviews/mock-interview-room";

import { trialInterviewDocument, writeInterview } from "./browser-store";
import {
  evaluateAnswer,
  isMissingAiConfig,
  requestFollowUp,
  requestReport,
  startInterview,
} from "./client";
import {
  completeTrialInterview,
  followUpCount,
  insertTrialFollowUp,
  mainQuestionCount,
  recordTrialAnswer,
  recordTrialEvaluation,
  type TrialInterview,
  type TrialResumeInput,
} from "./interview";
import { addCompletedMockInterview, deleteInterview } from "./workspace-interviews";
import { mutateWorkspace } from "./workspace-store";

/**
 * 网页版模拟面试的浏览器动作：与本地版 API 承担相同职责，
 * 差别只在状态写进浏览器存储而不是数据库。
 * 房间组件通过 MockInterviewRoomTransport 使用这里的实现，UI 零分叉。
 */

function rethrow(caught: unknown, fallback: string): never {
  if (isMissingAiConfig(caught)) {
    throw new Error("模型连接已失效，请到设置页重新连接后继续。");
  }
  throw caught instanceof Error ? caught : new Error(fallback);
}

function requireSession(): TrialInterview {
  const doc = trialInterviewDocument.read();
  if (!doc) {
    throw new Error("没有找到进行中的面试会话，请重新开始一场。");
  }
  return doc;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** 与本地版 POST /api/interviews/mock 同责：读表单、出题、给出房间地址。 */
export async function createTrialMockSession(
  formData: FormData,
  resume: TrialResumeInput,
): Promise<{ href: string }> {
  const companyName = field(formData, "companyName");
  const jobTitle = field(formData, "jobTitle");
  if (!companyName || !jobTitle) {
    throw new Error("请填写公司名称和岗位名称。");
  }

  try {
    const interview = await startInterview({
      job: {
        companyName,
        jobTitle,
        jobDescription: field(formData, "jobDescriptionText"),
      },
      resume,
      options: {
        questionCount: Number(field(formData, "questionCount")),
        difficulty: field(formData, "difficulty"),
        round: field(formData, "round") || null,
        followUpsEnabled: formData.get("followUpsEnabled") !== null,
      },
    });
    writeInterview(interview);
    return { href: `/interviews/mock/${interview.id}` };
  } catch (caught) {
    rethrow(caught, "创建模拟面试失败。");
  }
}

/** 房间数据通道：提交/跳过推进会话文档，交卷时生成报告并写入工作台历史。 */
export function createTrialRoomTransport(): MockInterviewRoomTransport {
  return {
    voiceEnabled: false,
    // 报告写入会话文档后，订阅该文档的页面会自行重渲染出报告视图。
    onCompleted: () => {},

    async submitAnswer({ questionId, answer, skip }) {
      const doc = requireSession();
      const index = doc.currentIndex;
      const question = doc.questions[index];
      if (!question || question.uid !== questionId) {
        throw new Error("题目状态不同步，请刷新页面后继续。");
      }

      const text = (answer ?? "").trim();
      let next = recordTrialAnswer(doc, index, skip ? null : text);

      try {
        if (!skip) {
          const evaluation = await evaluateAnswer({
            question,
            answer: text,
            jobTitle: doc.job.jobTitle,
            jobDescription: doc.job.jobDescription,
          });
          next = recordTrialEvaluation(next, index, evaluation);

          // 追问只针对主题目，且受预算限制；失败不打断面试。
          if (doc.followUpsEnabled && question.parentIndex === null) {
            try {
              const followUp = await requestFollowUp({
                question,
                answer: text,
                blueprint: doc.blueprint,
                mainQuestionCount: mainQuestionCount(doc),
                existingFollowUpCount: followUpCount(doc),
              });
              if (followUp) next = insertTrialFollowUp(next, index, followUp);
            } catch {
              // 追问是锦上添花，静默跳过。
            }
          }
        }
      } catch (caught) {
        rethrow(caught, "提交回答失败。");
      }

      writeInterview(next);

      const inserted =
        next.questions.length > doc.questions.length
          ? next.questions[index + 1]
          : null;
      const outcome: MockInterviewAnswerOutcome = {
        status: next.status,
        currentQuestionIndex: next.currentIndex,
        questionCount: next.questions.length,
        nextQuestion: inserted
          ? {
              id: inserted.uid,
              question: inserted.question,
              category: inserted.category,
              sortOrder: index + 1,
              isFollowUp: true,
            }
          : null,
      };
      return outcome;
    },

    async complete() {
      const doc = requireSession();
      try {
        const answered = doc.questions.flatMap((item, index) => {
          const evaluation = doc.evaluations[index];
          return doc.answers[index]?.trim() && evaluation
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
          jobTitle: doc.job.jobTitle,
          answered,
          scores: doc.evaluations.map((item) => item?.score ?? 0),
        });

        const completed = completeTrialInterview(doc, report);
        writeInterview(completed);
        // 写入工作台历史：列表、复盘与能力画像都从这里取证据。
        mutateWorkspace((workspace) =>
          addCompletedMockInterview(workspace, {
            id: completed.id,
            companyName: completed.job.companyName,
            jobTitle: completed.job.jobTitle,
            questions: completed.questions.map((question, index) => ({
              question: question.question,
              answer: completed.answers[index] ?? null,
              category: question.category,
              score: completed.evaluations[index]?.score ?? null,
              feedback: completed.evaluations[index]?.feedback ?? null,
            })),
            totalScore: report.totalScore,
            report,
          }),
        );
      } catch (caught) {
        rethrow(caught, "生成面试报告失败。");
      }
    },
  };
}

/** 删除一场体验版模拟面试：清掉工作台记录，进行中的会话文档一并丢弃。 */
export function deleteTrialMockSession(id: string): void {
  mutateWorkspace((workspace) => deleteInterview(workspace, id));
  if (trialInterviewDocument.read()?.id === id) {
    writeInterview(null);
  }
}

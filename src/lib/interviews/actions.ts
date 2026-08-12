"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { z } from "zod";

import {
  deriveVoiceMetrics,
  transcriptionSegmentSchema,
} from "./voice-metrics";

import {
  REAL_INTERVIEW_STATUS,
  type InterviewActionState,
  type InterviewQuestionInput,
  parseInterviewFormData,
} from "./types";
import { diffInterviewQuestions } from "./question-diff";

function questionData(question: InterviewQuestionInput) {
  return {
    question: question.question,
    answer: question.answer || null,
    category: question.category,
    resumeProjectId:
      question.category === "resume_project" ? question.resumeProjectId : null,
    sortOrder: question.sortOrder,
  };
}

function questionCreateData(questions: InterviewQuestionInput[]) {
  return questions.map(questionData);
}

function revalidateInterviewRoutes() {
  revalidatePath("/interviews");
  revalidatePath("/interviews/history");
  revalidatePath("/interviews/review");
  revalidatePath("/interviews/profile");
}

export async function createInterview(
  _prevState: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  const parsed = parseInterviewFormData(formData);
  if (!parsed.ok) {
    return { status: "error", message: parsed.message };
  }

  const artifactId = formData.get("importArtifactId");
  const requestedSpeaker = formData.get("candidateSpeaker");
  const artifact =
    typeof artifactId === "string" && artifactId
      ? await prisma.interviewImportArtifact.findFirst({
          where: { id: artifactId, consumedAt: null, expiresAt: { gt: new Date() } },
        })
      : null;
  if (typeof artifactId === "string" && artifactId && !artifact) {
    return { status: "error", message: "导入草稿已过期或已被使用，请重新导入。" };
  }
  const sourceDeclaration = formData.get("sourceType");
  const sourceType = artifact?.sourceType ??
    (sourceDeclaration === "real_transcript" ? "real_transcript" : "real_summary");
  const segmentsResult = artifact
    ? z.array(transcriptionSegmentSchema).safeParse(JSON.parse(artifact.segmentsJson))
    : null;
  const segments = segmentsResult?.success ? segmentsResult.data : [];
  const speakers = [...new Set(segments.flatMap((segment) => segment.speaker ? [segment.speaker] : []))];
  const candidateSpeaker =
    typeof requestedSpeaker === "string" && speakers.includes(requestedSpeaker)
      ? requestedSpeaker
      : null;
  if (speakers.length > 0 && !candidateSpeaker) {
    return { status: "error", message: "请先在转写预览中指定哪位说话人是你。" };
  }
  const voiceMetrics = artifact && sourceType === "real_audio"
    ? deriveVoiceMetrics(segments, candidateSpeaker)
    : null;

  await prisma.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        sourceType,
        companyName: parsed.value.companyName,
        jobTitle: parsed.value.jobTitle,
        interviewedAt: parsed.value.interviewedAt,
        scheduledAt: parsed.value.interviewedAt,
        round: parsed.value.round,
        status: REAL_INTERVIEW_STATUS,
        note: parsed.value.note || null,
        questions: { create: questionCreateData(parsed.value.questions) },
      },
    });
    if (artifact) {
      await tx.interviewImportArtifact.update({
        where: { id: artifact.id },
        data: {
          interviewId: interview.id,
          candidateSpeaker,
          voiceMetricsJson: voiceMetrics ? JSON.stringify(voiceMetrics) : null,
          consumedAt: new Date(),
        },
      });
    }
  });

  await enqueueCandidateProfileRefresh();

  revalidateInterviewRoutes();
  return { status: "success", message: "面试记录已创建。" };
}

export async function updateInterview(
  id: string,
  _prevState: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  const existing = await prisma.interview.findUnique({
    where: { id },
    select: { kind: true, questions: { select: { id: true } } },
  });
  if (!existing || existing.kind === "mock") {
    return { status: "error", message: "AI 模拟面试不能通过历史记录表单编辑。" };
  }

  const parsed = parseInterviewFormData(formData);
  if (!parsed.ok) {
    return { status: "error", message: parsed.message };
  }

  let questionDiff;
  try {
    questionDiff = diffInterviewQuestions(
      existing.questions,
      parsed.value.questions,
    );
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "问题数据无效。",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.interview.update({
      where: { id },
      data: {
        companyName: parsed.value.companyName,
        jobTitle: parsed.value.jobTitle,
        interviewedAt: parsed.value.interviewedAt,
        scheduledAt: parsed.value.interviewedAt,
        round: parsed.value.round,
        status: REAL_INTERVIEW_STATUS,
        note: parsed.value.note || null,
      },
    });
    await Promise.all(
      questionDiff.toUpdate.map((question) =>
        tx.interviewQuestion.update({
          where: { id: question.id },
          data: questionData(question),
        }),
      ),
    );
    if (questionDiff.toCreate.length > 0) {
      await tx.interviewQuestion.createMany({
        data: questionDiff.toCreate.map((question) => ({
          interviewId: id,
          ...questionData(question),
        })),
      });
    }
    if (questionDiff.toDeleteIds.length > 0) {
      await tx.interviewQuestion.deleteMany({
        where: { interviewId: id, id: { in: questionDiff.toDeleteIds } },
      });
    }
  });

  await enqueueCandidateProfileRefresh();

  revalidateInterviewRoutes();
  return { status: "success", message: "面试记录已更新。" };
}

export async function deleteInterview(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return;
  }

  await prisma.interview.delete({ where: { id } });
  await enqueueCandidateProfileRefresh({ fullRebuild: true });
  revalidateInterviewRoutes();
}

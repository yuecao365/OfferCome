"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { advancedStage } from "@/lib/applications/stage-advance";
import { normalizeApplicationStage } from "@/lib/applications/types";
import { z } from "zod";

import {
  deriveVoiceMetrics,
  transcriptionSegmentSchema,
} from "./voice-metrics";

import {
  deriveRealInterviewStatus,
  type InterviewActionState,
  type InterviewQuestionInput,
  type InterviewRound,
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

/** 表单传来的投递关联，必须真实存在才写入；不存在时静默忽略。 */
async function resolveApplicationId(
  formData: FormData,
): Promise<string | null> {
  const value = formData.get("applicationId");
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const application = await prisma.bossContact.findUnique({
    where: { id: value.trim() },
    select: { id: true },
  });
  return application?.id ?? null;
}

/**
 * 记录真实面试后把关联投递推进到对应阶段（只升不降）。
 * 模拟面试不调用这里——练习不代表流程有进展。
 */
async function advanceApplicationStage(
  applicationId: string | null,
  round: InterviewRound | null,
): Promise<void> {
  if (!applicationId) return;

  const application = await prisma.bossContact.findUnique({
    where: { id: applicationId },
    select: { stage: true },
  });
  if (!application) return;

  const nextStage = advancedStage(
    normalizeApplicationStage(application.stage),
    round,
  );
  if (!nextStage) return;

  await prisma.bossContact.update({
    where: { id: applicationId },
    data: {
      stage: nextStage,
      // 与手动改状态语义一致：用户有了新进展就不该再被自动拒绝逻辑改写。
      autoRejectedAt: null,
      unchangedSince: new Date(),
    },
  });
  revalidatePath("/applications");
  revalidatePath("/");
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
  const applicationId = await resolveApplicationId(formData);

  await prisma.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        sourceType,
        companyName: parsed.value.companyName,
        jobTitle: parsed.value.jobTitle,
        applicationId,
        interviewedAt: parsed.value.interviewedAt,
        scheduledAt: parsed.value.interviewedAt,
        round: parsed.value.round,
        // 面试时间在未来就先存成待面试，用户面完回来补录问答时会自动转为已完成。
        status: deriveRealInterviewStatus(parsed.value.interviewedAt),
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
  await advanceApplicationStage(applicationId, parsed.value.round);

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
    select: {
      kind: true,
      applicationId: true,
      questions: { select: { id: true } },
    },
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
        // 同上：补录问答时面试时间已过，记录会自动从待面试转为已完成。
        status: deriveRealInterviewStatus(parsed.value.interviewedAt),
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
  // 编辑表单不改关联，沿用记录上已有的投递。
  await advanceApplicationStage(existing.applicationId, parsed.value.round);

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

  if (formData.get("redirectTo") === "/interviews/mock") {
    redirect("/interviews/mock");
  }
}

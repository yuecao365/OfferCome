import { MAX_JD_TEXT, readJobDescriptionFile } from "@/lib/documents/job-description";
import { defineMessages, type Locale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { isMockInterviewGenerationError } from "@/lib/mock-interviews/errors";
import { createMockInterview } from "@/lib/mock-interviews/service";
import { scheduleMockInterviewGeneration } from "@/lib/mock-interviews/generation-background";

const messages = defineMessages({
  "zh-CN": {
    createFailed: "创建模拟面试失败。",
    jdRequired: "请上传或粘贴岗位描述。",
    jdTooLong: "岗位描述不能超过 10 万字符。",
    sessionFailed: "模拟面试会话创建失败。",
  },
  en: {
    createFailed: "Couldn't create the mock interview.",
    jdRequired: "Upload or paste a job description.",
    jdTooLong: "Job descriptions can't exceed 100,000 characters.",
    sessionFailed: "Couldn't create the mock interview session.",
  },
});

function stringValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function errorResponse(error: unknown, locale: Locale) {
  const generationError = isMockInterviewGenerationError(error) ? error : null;
  return Response.json(
    {
      error: error instanceof Error ? error.message : messages[locale].createFailed,
      code: generationError?.code ?? "invalid_request",
      retryable: generationError?.retryable ?? false,
    },
    { status: generationError ? 502 : 400 },
  );
}

async function readJobDescription(formData: FormData, locale: Locale): Promise<{
  text: string;
  originalName: string | null;
}> {
  const file = formData.get("jobDescriptionFile");
  if (file instanceof File && file.name) return readJobDescriptionFile(file, locale);

  const text = stringValue(formData, "jobDescriptionText");
  if (!text) throw new Error(messages[locale].jdRequired);
  if (text.length > MAX_JD_TEXT) throw new Error(messages[locale].jdTooLong);
  return { text, originalName: null };
}

export async function POST(request: Request) {
  const locale = await getLocale();
  try {
    const formData = await request.formData();
    const jobDescription = await readJobDescription(formData, locale);
    const result = await createMockInterview({
      companyName: stringValue(formData, "companyName"),
      jobTitle: stringValue(formData, "jobTitle"),
      resumeId: stringValue(formData, "resumeId"),
      jobDescription: jobDescription.text,
      jdOriginalName: jobDescription.originalName,
      interactionMode: "text",
      pace: stringValue(formData, "pace"),
      language: stringValue(formData, "language"),
      seedQuestionId: stringValue(formData, "seedQuestionId") || null,
      applicationId: stringValue(formData, "applicationId") || null,
      evalTag: stringValue(formData, "evalTag") || null,
    });
    if (!result.mockSession) throw new Error(messages[locale].sessionFailed);
    scheduleMockInterviewGeneration(result.mockSession.id);
    return Response.json({
      id: result.mockSession.id,
      interviewId: result.id,
      href: `/interviews/mock/${result.mockSession.id}`,
    });
  } catch (error) {
    console.warn(
      "[mock-interviews] creation failed:",
      JSON.stringify({
        code: isMockInterviewGenerationError(error) ? error.code : "invalid_request",
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
    return errorResponse(error, locale);
  }
}

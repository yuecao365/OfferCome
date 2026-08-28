import path from "node:path";

import { extractDocumentText } from "@/lib/documents/extract-text";
import { isMockInterviewGenerationError } from "@/lib/mock-interviews/errors";
import { createMockInterview } from "@/lib/mock-interviews/service";
import { scheduleMockInterviewGeneration } from "@/lib/mock-interviews/generation-background";
import { isTrialMode } from "@/lib/runtime-mode";

/** 体验模式固定 3 题速览、文字作答——控制访客 Key 的花费，也降低弃坑率。 */
const TRIAL_QUESTION_COUNT = 3;

const MAX_JD_BYTES = 10 * 1024 * 1024;
const MAX_JD_TEXT = 100_000;
const JD_EXTENSIONS = new Set([".txt", ".md", ".docx", ".pdf"]);

function stringValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function errorResponse(error: unknown) {
  const generationError = isMockInterviewGenerationError(error) ? error : null;
  return Response.json(
    {
      error: error instanceof Error ? error.message : "创建模拟面试失败。",
      code: generationError?.code ?? "invalid_request",
      retryable: generationError?.retryable ?? false,
    },
    { status: generationError ? 502 : 400 },
  );
}

async function readJobDescription(formData: FormData): Promise<{
  text: string;
  originalName: string | null;
}> {
  const file = formData.get("jobDescriptionFile");
  if (file instanceof File && file.name) {
    const extension = path.extname(file.name).toLowerCase();
    if (!JD_EXTENSIONS.has(extension)) {
      throw new Error("岗位描述只支持 TXT、MD、DOCX 或 PDF 文件。");
    }
    if (file.size > MAX_JD_BYTES) throw new Error("岗位描述文件不能超过 10MB。");
    const text = await extractDocumentText({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    });
    if (!text.trim()) throw new Error("没有从岗位描述中提取到文本。");
    return { text: text.slice(0, MAX_JD_TEXT), originalName: file.name };
  }

  const text = stringValue(formData, "jobDescriptionText");
  if (!text) throw new Error("请上传或粘贴岗位描述。");
  if (text.length > MAX_JD_TEXT) throw new Error("岗位描述不能超过 10 万字符。");
  return { text, originalName: null };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const jobDescription = await readJobDescription(formData);
    const result = await createMockInterview({
      companyName: stringValue(formData, "companyName"),
      jobTitle: stringValue(formData, "jobTitle"),
      resumeId: stringValue(formData, "resumeId"),
      jobDescription: jobDescription.text,
      jdOriginalName: jobDescription.originalName,
      round: stringValue(formData, "round") || null,
      difficulty: stringValue(formData, "difficulty") || "standard",
      interactionMode: isTrialMode()
        ? "text"
        : stringValue(formData, "interactionMode") || "text",
      questionCount: isTrialMode()
        ? TRIAL_QUESTION_COUNT
        : Number(stringValue(formData, "questionCount") || 8),
      followUpsEnabled: formData.get("followUpsEnabled") === "on",
      seedQuestionId: stringValue(formData, "seedQuestionId") || null,
      seedInsightId: stringValue(formData, "seedInsightId") || null,
      applicationId: stringValue(formData, "applicationId") || null,
    });
    if (!result.mockSession) throw new Error("模拟面试会话创建失败。");
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
    return errorResponse(error);
  }
}

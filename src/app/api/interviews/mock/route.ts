import { MAX_JD_TEXT, readJobDescriptionFile } from "@/lib/documents/job-description";
import { isMockInterviewGenerationError } from "@/lib/mock-interviews/errors";
import { createMockInterview } from "@/lib/mock-interviews/service";
import { scheduleMockInterviewGeneration } from "@/lib/mock-interviews/generation-background";

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
  if (file instanceof File && file.name) return readJobDescriptionFile(file);

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
      interactionMode: stringValue(formData, "interactionMode") || "text",
      pace: stringValue(formData, "pace"),
      seedQuestionId: stringValue(formData, "seedQuestionId") || null,
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

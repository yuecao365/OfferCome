import {
  parseTrialResumeForm,
  parseTrialResumeUpload,
  type TrialResumeFormInput,
} from "@/lib/trial/resume";
import { withTrial } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * 解析简历内容并原样返回，**不做任何保存**。
 * multipart 走上传解析（文件只在内存里过一遍），JSON 走手动填写。
 * 请求头带了访客的模型配置时，实习/项目由模型抽取；没带则按章节规则识别。
 */
export const POST = withTrial(async (request) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.name) {
      throw new Error("请选择要上传的简历文件。");
    }
    return { resume: await parseTrialResumeUpload(file) };
  }

  const body = (await request.json()) as Partial<TrialResumeFormInput>;
  return {
    resume: parseTrialResumeForm({
      summary: typeof body.summary === "string" ? body.summary : "",
      experiences: Array.isArray(body.experiences)
        ? body.experiences.map((item) => ({
            name: typeof item?.name === "string" ? item.name : "",
            type: typeof item?.type === "string" ? item.type : "project",
            organization:
              typeof item?.organization === "string" ? item.organization : "",
            description:
              typeof item?.description === "string" ? item.description : "",
          }))
        : [],
    }),
  };
});

import { readJobDescriptionFile } from "@/lib/documents/job-description";
import { withTrial } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 45;

/** 岗位描述文件 → 文本，原样返回、不保存；与本地版创建接口同一个解析器。 */
export const POST = withTrial(async (request) => {
  const file = (await request.formData()).get("jobDescriptionFile");
  if (!(file instanceof File) || !file.name) throw new Error("请选择要上传的岗位描述文件。");
  return await readJobDescriptionFile(file);
});

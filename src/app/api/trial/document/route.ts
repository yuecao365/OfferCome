import { readJobDescriptionFile } from "@/lib/documents/job-description";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { withTrial } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 45;

const messages = defineMessages({
  "zh-CN": { noFile: "请选择要上传的岗位描述文件。" },
  en: { noFile: "Choose a job description file to upload." },
});

/** 岗位描述文件 → 文本，原样返回、不保存；与本地版创建接口同一个解析器。 */
export const POST = withTrial(async (request) => {
  const locale = await getLocale();
  const file = (await request.formData()).get("jobDescriptionFile");
  if (!(file instanceof File) || !file.name) throw new Error(messages[locale].noFile);
  return await readJobDescriptionFile(file, locale);
});

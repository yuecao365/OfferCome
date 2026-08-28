import { NextResponse } from "next/server";

import { isTrialMode } from "@/lib/runtime-mode";
import {
  createTrialResumeFromForm,
  createTrialResumeFromUpload,
  type TrialResumeFormInput,
} from "@/lib/trial/resume";

export const runtime = "nodejs";

/** 体验模式的简历录入：multipart 走上传解析，JSON 走手动填写。 */
export async function POST(request: Request) {
  if (!isTrialMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File) || !file.name) {
        throw new Error("请选择要上传的简历文件。");
      }
      return NextResponse.json(await createTrialResumeFromUpload(file));
    }

    const body = (await request.json()) as Partial<TrialResumeFormInput>;
    return NextResponse.json(
      await createTrialResumeFromForm({
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
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "简历处理失败。" },
      { status: 400 },
    );
  }
}

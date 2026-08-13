import { NextResponse } from "next/server";

import {
  getWebSearchConfig,
  saveWebSearchConfig,
  toPublicWebSearchConfig,
  type WebSearchConfig,
} from "@/lib/settings/web-search";

const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { provider?: unknown; apiKey?: unknown };
    if (body.provider !== "none" && body.provider !== "tavily") {
      return NextResponse.json({ error: "未知的搜索服务。" }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const existing = await getWebSearchConfig();
    const apiKey = Object.hasOwn(body, "apiKey")
      ? typeof body.apiKey === "string" ? body.apiKey.trim() || null : null
      : existing.apiKey;
    if (body.provider === "tavily" && !apiKey) {
      return NextResponse.json({ error: "请填写 Tavily API Key。" }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const config: WebSearchConfig = {
      provider: body.provider,
      apiKey: body.provider === "tavily" ? apiKey : null,
    };
    await saveWebSearchConfig(config);
    return NextResponse.json(toPublicWebSearchConfig(config), { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "保存搜索设置失败。" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

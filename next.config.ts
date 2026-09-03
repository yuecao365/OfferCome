import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: {
    // 技能包是运行时用 fs 读取的 SKILL.md，构建裁剪时必须显式带上。
    "/*": ["./prisma/demo.db", "./src/lib/mock-interviews/skills/**/SKILL.md"],
    "/api/interviews/draft": [
      "./node_modules/@ffmpeg-installer/*/ffmpeg*",
    ],
  },
  experimental: {
    // 页面切换走浏览器原生 View Transitions，不支持的浏览器自动退化为硬切。
    viewTransition: true,
    serverActions: {
      bodySizeLimit: "11mb",
    },
    // proxy.ts 会缓冲请求体，默认 10MB 上限会把录音导入截断成无法解析的
    // FormData。这里放宽到略高于 MAX_INTERVIEW_AUDIO_BYTES（25MB）。
    proxyClientMaxBodySize: "26mb",
  },
  turbopack: {
    root,
  },
};

export default nextConfig;

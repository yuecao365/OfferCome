import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: {
    "/*": ["./prisma/demo.db"],
    "/api/interviews/draft": [
      "./node_modules/@ffmpeg-installer/*/ffmpeg*",
    ],
  },
  experimental: {
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

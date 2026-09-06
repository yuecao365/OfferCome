import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: {
    // 运行时用 fs 读取、静态分析看不见的文件，构建裁剪时必须显式带上：
    // 技能包 SKILL.md；pdfjs 的 legacy 构建（经 new Function 动态 import 加载）、
    // CMap 与标准字体（中文简历没有 CMap 就会整体丢字）。
    "/*": [
      "./src/lib/mock-interviews/skills/**/SKILL.md",
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/pdfjs-dist/cmaps/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
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

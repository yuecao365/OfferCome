export function isDemoMode(
  env?: { APP_MODE?: string; VERCEL?: string },
): boolean {
  const runtimeEnv = env ?? {
    APP_MODE: process.env.APP_MODE,
    VERCEL: process.env.VERCEL,
  };

  return runtimeEnv.APP_MODE === "demo" || runtimeEnv.VERCEL === "1";
}

/**
 * 体验模式：访客可以真的跑一场 AI 模拟面试。
 * 与 demo（全站只读）不同——每个访客有自己的临时数据空间和自带的 AI Key，
 * 模拟面试相关的写路径开放，其余仍然只读。
 */
export function isTrialMode(env?: { APP_MODE?: string }): boolean {
  return (env ?? { APP_MODE: process.env.APP_MODE }).APP_MODE === "trial";
}

/**
 * 体验模式唯一允许的写入口：/api/trial/* 这一组无状态接口。
 *
 * 它们不碰数据库、不写磁盘——收到请求里的数据，调模型，把结果返回给浏览器
 * 保存。其余一切写操作（Server Action、Boss 同步、设置写入、录音导入）
 * 都会落到服务端存储上，在体验模式下没有意义，一律拒绝。
 */
export function isTrialWritablePath(pathname: string): boolean {
  return pathname.startsWith("/api/trial/");
}

const PUBLIC_DEMO_PATHS = new Set([
  "/homepage",
  "/showcase",
  "/applications",
  "/resumes",
  "/interviews",
  "/settings",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

export function isPublicDemoPath(pathname: string): boolean {
  return (
    PUBLIC_DEMO_PATHS.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/showcase/") ||
    pathname.startsWith("/interviews/")
  );
}

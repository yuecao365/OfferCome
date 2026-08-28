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
 * 体验模式允许的写路径。白名单按端点精确列出：开放的是"发起并完成一场
 * 模拟面试"这一条链路，别的写操作（投递、简历库、设置、Boss 同步）一律拒绝。
 */
const TRIAL_MOCK_ACTION_PATTERN =
  /^\/api\/interviews\/mock\/[^/]+\/(?:answer|complete|jd-strategy|retry-generation)$/;

export function isTrialWritablePath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/trial/") ||
    pathname === "/api/interviews/mock" ||
    TRIAL_MOCK_ACTION_PATTERN.test(pathname)
  );
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

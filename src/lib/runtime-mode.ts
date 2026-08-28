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

const TRIAL_MOCK_ACTION_PATTERN =
  /^\/api\/interviews\/mock\/[^/]+\/(?:answer|complete|jd-strategy|retry-generation)$/;

/**
 * 体验模式允许的写路径。
 *
 * 分两类判定，因为写入口本身就有两种形态：
 * - API 路由走精确白名单。凡是会把访客数据写出会话边界的都不在其中：
 *   设置写入（Key 会落库）、Boss 同步（服务器上没有访客登录态）、
 *   录音导入与语音转写（要落音频文件，二期再说）。
 * - Server Action 由 Next 发往页面路径而不是 /api，所以按"非 API 的 POST"
 *   整体放行。投递、面试记录、简历项目的增删改都在这一类，数据全部落在
 *   访客自己的会话库里；个别会写服务器文件的动作在动作内部单独再挡一道。
 */
export function isTrialWritablePath(pathname: string): boolean {
  if (pathname.startsWith("/api/")) {
    return (
      pathname.startsWith("/api/trial/") ||
      pathname === "/api/interviews/mock" ||
      TRIAL_MOCK_ACTION_PATTERN.test(pathname)
    );
  }

  return true;
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

export function isDemoMode(
  env?: { APP_MODE?: string; VERCEL?: string },
): boolean {
  const runtimeEnv = env ?? {
    APP_MODE: process.env.APP_MODE,
    VERCEL: process.env.VERCEL,
  };

  return runtimeEnv.APP_MODE === "demo" || runtimeEnv.VERCEL === "1";
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

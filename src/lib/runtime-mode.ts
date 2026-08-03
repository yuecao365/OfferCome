export function isDemoMode(
  env?: { APP_MODE?: string; VERCEL?: string },
): boolean {
  const runtimeEnv = env ?? {
    APP_MODE: process.env.APP_MODE,
    VERCEL: process.env.VERCEL,
  };

  return runtimeEnv.APP_MODE === "demo" || runtimeEnv.VERCEL === "1";
}

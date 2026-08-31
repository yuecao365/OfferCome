/**
 * 网页版（trial）：服务端完全无状态，访客数据和 AI Key 都在自己的浏览器里，
 * 模拟面试等计算接口开放，其余一切写服务端的操作一律拒绝。
 *
 * 没有这个标记时就是本地版：数据落在本机 SQLite，功能不设限。
 */
export function isTrialMode(
  env?: { APP_MODE?: string; VERCEL?: string },
): boolean {
  const runtimeEnv = env ?? {
    APP_MODE: process.env.APP_MODE,
    VERCEL: process.env.VERCEL,
  };

  if (runtimeEnv.APP_MODE === "trial") return true;
  // Vercel 没有可写的持久磁盘，本地版形态在上面根本跑不起来；
  // 环境变量漏配时也要落到网页版，而不是把一个会写服务端的实例暴露出去。
  return runtimeEnv.VERCEL === "1" && runtimeEnv.APP_MODE !== "local";
}

/**
 * 网页版唯一允许的写入口：/api/trial/* 这一组无状态接口。
 *
 * 它们不碰数据库、不写磁盘——收到请求里的数据，调模型，把结果返回给浏览器
 * 保存。其余一切写操作（Server Action、Boss 同步、设置写入、录音导入）
 * 都会落到服务端存储上，在网页版没有意义，一律拒绝。
 */
export function isTrialWritablePath(pathname: string): boolean {
  return pathname.startsWith("/api/trial/");
}

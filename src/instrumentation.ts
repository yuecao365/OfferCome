/**
 * Next.js 服务启动钩子：把 agent 运行记录的持久化落点装上。
 * 只在 Node 运行时执行；网页版由 installAgentRunPersistence 自行跳过。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installAgentRunPersistence } = await import("@/lib/ai/agent-run-store");
  installAgentRunPersistence();
}

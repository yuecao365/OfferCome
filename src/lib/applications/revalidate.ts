import { revalidatePath } from "next/cache";

/**
 * 渲染投递数据的页面。面试记录推进投递阶段时也要刷新这些，
 * 所以放在 actions.ts 之外——"use server" 文件不允许导出同步函数。
 */
const APPLICATION_DEPENDENT_PATHS = ["/", "/applications"];

export function revalidateApplicationRoutes(): void {
  for (const path of APPLICATION_DEPENDENT_PATHS) {
    revalidatePath(path);
  }
}

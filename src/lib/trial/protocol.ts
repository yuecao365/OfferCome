/**
 * 体验版前后端之间的约定。
 *
 * 单独成文件是因为客户端组件要用它：ai-config.ts 依赖 node:async_hooks，
 * 被浏览器打包会直接构建失败。这里只放两端共享的常量与类型，不含任何实现。
 */

/** 访客自带的模型配置随这个请求头传递，不入请求体（出错时更不容易被日志记录）。 */
export const TRIAL_AI_HEADER = "x-offerlai-trial-ai";

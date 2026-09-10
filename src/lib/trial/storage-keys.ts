/**
 * 体验版在访客浏览器里占用的全部存储标识。
 *
 * 这些字符串原本散在 browser-store / file-store / workspace-store 里各自声明，
 * 但它们共享同一个命名空间前缀——集中到一处后，换前缀只改 PREFIX 一行，
 * 不会再出现"改了 localStorage 忘了 IndexedDB"这类漏改。
 *
 * 前缀变更会让访客已有的草稿、工作台和简历原件读不到（键名对不上），
 * 所以只在确实要换命名空间时才动它。
 */
const PREFIX = "offercome.trial";

/** 访客自带的模型连接串；存 local 还是 session 由 AI_REMEMBER_KEY 决定。 */
export const AI_TOKEN_KEY = `${PREFIX}.ai`;
/** 是否跨会话记住连接。 */
export const AI_REMEMBER_KEY = `${PREFIX}.ai.remember`;
/** 模拟面试会话表（按 id），进行中与已完成的都在；关掉网页再回来要能接着答。 */
export const INTERVIEWS_KEY = `${PREFIX}.interviews`;
/** 工作台文档：投递、面试、简历索引。 */
export const WORKSPACE_KEY = `${PREFIX}.workspace`;
/** 简历原件仓库（IndexedDB 库名，不是 localStorage 键）。 */
export const FILE_DATABASE_NAME = `${PREFIX}.files`;

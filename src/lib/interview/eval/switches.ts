import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 消融开关（只给评测用）。
 *
 * 目的是回答"我写的这一层到底有没有用"：关掉某一个机制，跑同一批用例，看行为判定掉多少。
 * 这不是回归来的实验层——没有灰度、没有分流、没有在线变体，只有一个文件开关，评测脚本跑之前写、跑完删。
 * 文件不存在时（也就是真实使用时）恒为全开，所以产品路径上这几处判断永远走 false 分支。
 */

export const ABLATIONS = ["packs", "constraints", "ledger", "statecard", "basis", "asktool"] as const;
export type Ablation = (typeof ABLATIONS)[number];

export const ABLATION_LABELS: Record<Ablation, string> = {
  packs: "技能包",
  constraints: "动作约束与重出",
  ledger: "证据账",
  statecard: "状态卡",
  basis: "依据门禁",
  asktool: "提问工具",
};

const FILE = path.join(process.cwd(), "eval", "ablation.json");
/** 每回合都会问一次，缓存一下别每次读盘；评测脚本改完文件后下一场才生效，够用。 */
const TTL_MS = 2_000;
/** 面试官策略：agent（缺省）或 script（固定题本，不调模型；同预算对照用）。 */
export const POLICIES = ["agent", "script"] as const;
export type EvalPolicy = (typeof POLICIES)[number];

let cache: { at: number; off: Set<string>; policy: EvalPolicy } = { at: 0, off: new Set(), policy: "agent" };

function current(): { off: Set<string>; policy: EvalPolicy } {
  const now = Date.now();
  if (now - cache.at < TTL_MS) return cache;
  let off = new Set<string>();
  let policy: EvalPolicy = "agent";
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as { off?: unknown; policy?: unknown };
    if (Array.isArray(parsed.off)) off = new Set(parsed.off.filter((item): item is string => typeof item === "string"));
    if (parsed.policy === "script") policy = "script";
  } catch {
    // 文件不存在或坏了就是全开，这是真实使用时的唯一路径。
  }
  cache = { at: now, off, policy };
  return cache;
}

/** 评测指定的面试官策略；真实使用恒为 agent。 */
export function evalPolicy(): EvalPolicy {
  return current().policy;
}

/** 这个机制被关掉了吗。 */
export function ablated(name: Ablation): boolean {
  return current().off.has(name);
}

/** 这一轮关掉了哪些（写进产物，便于对照表标注）。 */
export function ablationsOff(): Ablation[] {
  const { off } = current();
  return ABLATIONS.filter((name) => off.has(name));
}

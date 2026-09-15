import type { AreaKind, InterviewArea, InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { LATE_RATIO, minutesLeft, type Clock } from "./clock";
import { classifyReply, type TranscriptLine } from "./events";

/**
 * 一个决策（设计修订 v3 §1.4）：代码把时钟、覆盖账、候选人这句的类型合成"这回合的动作"，面试官只看这一个。
 * 何时转题、收窄、收尾都在这里裁决，冲突按下面的顺序解决，不留给模型。纯函数，可重放。
 */

export type Move = "continue" | "switch" | "close";
/** next：换题时决策指的第一份材料（模型没报新材料或还报着上一份时，这句就记到它名下；底线替换时问它的切入问法）。 */
export type Decision = { move: Move; reason: string; next?: string };

export const MOVE_LABELS: Record<Move, string> = { continue: "继续", switch: "换题", close: "收尾" };

/** 同一话题第一问之后最多追这么多轮。 */
export const MAX_PROBES_PER_TOPIC = 3;
/** 到这个时间比例还没问过基础题 / 场景题，就该转。 */
export const QUICK_DUE_RATIO = 0.5;
export const SCENARIO_DUE_RATIO = LATE_RATIO;
const MAX_CANDIDATES = 3;

/** 当前话题：最近一句面试官自报的材料 id（往回找第一个非空的）。 */
export function currentTopic(transcript: Pick<TranscriptLine, "role" | "topic">[]): string | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const line = transcript[index];
    if (line.role === "interviewer" && line.topic) return line.topic;
  }
  return null;
}

/** 聊过的材料 id（按第一次出现的顺序）。 */
export function coveredIds(transcript: Pick<TranscriptLine, "role" | "topic">[]): string[] {
  const seen: string[] = [];
  for (const line of transcript) if (line.role === "interviewer" && line.topic && !seen.includes(line.topic)) seen.push(line.topic);
  return seen;
}

/** 候选人最近连续答不上了几次（隔着面试官的话不算断；不按话题分，模型自报的材料换了也照数——F2 冒烟里一次误报就让"两次答不上换题"没触发）。 */
export function trailingDontKnows(transcript: TranscriptLine[]): number {
  let count = 0;
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const line = transcript[index];
    if (line.role !== "candidate") continue;
    if (classifyReply(line) !== "dont_know") break;
    count += 1;
  }
  return count;
}

/** 收尾处这一话题追了几轮。 */
export function topicRun(transcript: TranscriptLine[]): { topic: string | null; probes: number } {
  const topic = currentTopic(transcript);
  let start = transcript.length;
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const line = transcript[index];
    if (line.role === "interviewer" && line.topic && line.topic !== topic) break;
    if (line.role === "interviewer") start = index;
  }
  const run = transcript.slice(start);
  const asked = run.filter((line) => line.role === "interviewer").length;
  return { topic, probes: Math.max(0, asked - 1) };
}

function unasked(brief: InterviewBrief, covered: string[], kind: AreaKind, except: string | null): InterviewArea[] {
  return brief.areas.filter((area) => area.kind === kind && !covered.includes(area.id) && area.id !== except);
}

/** 底线替换这句话时改问的材料：决策指的那份，否则按材料顺序第一份还没聊的。 */
export function areaToAsk(brief: InterviewBrief, transcript: Pick<TranscriptLine, "role" | "topic">[], decision: Decision): InterviewArea | null {
  const covered = coveredIds(transcript);
  return brief.areas.find((area) => area.id === decision.next) ?? brief.areas.find((area) => !covered.includes(area.id) && area.id !== currentTopic(transcript)) ?? null;
}

function describe(areas: InterviewArea[]): string {
  if (areas.length === 0) return "别的话题";
  return areas
    .slice(0, MAX_CANDIDATES)
    .map((area) => `「${area.name}」（${area.id}）`)
    .join("、");
}

export function decideMove(input: { brief: InterviewBrief; clock: Clock; transcript: TranscriptLine[]; opening: boolean }): Decision {
  const { brief, clock, transcript } = input;
  if (input.opening) return { move: "continue", reason: "开场：先问候，请候选人用一两分钟介绍与这个岗位相关的经历，不要问别的" };
  if (clock.phase === "over") return { move: "close", reason: "时间到了：只告别，不再提问" };

  const covered = coveredIds(transcript);
  const run = topicRun(transcript);
  const last = transcript.at(-1);
  const reply = last?.role === "candidate" ? classifyReply(last) : "normal";
  const current = brief.areas.find((area) => area.id === run.topic) ?? null;
  const ratio = clock.usedMinutes / clock.totalMinutes;
  const count = (kind: AreaKind) => covered.filter((id) => brief.areas.find((area) => area.id === id)?.kind === kind).length;
  const switchTo = (why: string, kind?: AreaKind): Decision => {
    const kinds: AreaKind[] = kind ? [kind] : [current?.kind ?? "project", "quick", "scenario"];
    const areas = kinds.flatMap((item) => unasked(brief, covered, item, run.topic));
    return { move: "switch", reason: `${why}：换到${describe(areas)}`, ...(areas[0] ? { next: areas[0].id } : {}) };
  };

  if (clock.phase === "wrap_up") return { move: "continue", reason: "快到时间了：最多再问一两句就告别，不开新话题" };
  if (reply === "skip") return switchTo("候选人要求跳过");
  if (reply === "dont_know" && trailingDontKnows(transcript) >= 2) return switchTo("候选人连续两次答不上，不纠缠");
  if (reply === "help") return { move: "continue", reason: "候选人要求具体或没听懂：换个说法把题说具体，不换题" };
  if (reply === "dont_know") return { move: "continue", reason: "候选人答不上：把题说具体或降一层再问一次；再答不上就换题" };
  if (count("scenario") === 0 && ratio >= SCENARIO_DUE_RATIO) return switchTo(`还剩约 ${minutesLeft(clock)} 分钟，场景题还没问`, "scenario");
  if (count("quick") === 0 && ratio >= QUICK_DUE_RATIO) return switchTo(`已用 ${Math.round(ratio * 100)}% 的时间，基础题还一道没问`, "quick");
  if (run.probes >= MAX_PROBES_PER_TOPIC) return switchTo(`这个话题已经追了 ${run.probes} 轮`);
  return { move: "continue", reason: "顺着候选人上一句追问，验证一件事，一句一个要点" };
}

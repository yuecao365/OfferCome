import type { ContentLanguage } from "@/lib/i18n/locale";
import type { AreaKind, InterviewBrief, InterviewPace } from "@/lib/mock-interviews/brief/brief";

import { initialNotes, pendingAmong, pendingCount } from "./notes";
import { planMaterials, type MaterialLane } from "./progress";

/**
 * 面试状态（重建 v5 §2）：从事件推导、不单独存。每份材料的状态、问了几句、追过的角度，候选人的信号计数与最近几句的新信息量，
 * 以及面试官自己的笔记（最新一版）。没有时钟：面试长短与时间无关（用户 2026-09-22 定）。
 * 它渲染成模型每回合看到的状态卡（renderState），也是动作底线（constraints.ts）与 trace / 评测的输入。
 * 这里只认 StateEvent 这个最小形状：事件日志（events.ts）是它的超集。
 */

/** 候选人这句是什么（模型判）。 */
export const SIGNALS = ["answered", "thin", "dont_know", "help", "not_mine", "refuse", "wants_end"] as const;
export type Signal = (typeof SIGNALS)[number];
/** 没有信息的三类：连续计数是状态卡上的信号，也是唯一的收尾硬上限的依据。 */
export const NO_INFO_SIGNALS: ReadonlySet<Signal> = new Set<Signal>(["dont_know", "not_mine", "refuse"]);

/** 面试官这回合做的事（模型提、代码只守底线）。 */
export const ACTIONS = ["probe", "switch", "clarify", "end"] as const;
export type Action = (typeof ACTIONS)[number];

/** 追问角度：模型自写的一句（agent-freedom-plan §2.3）。 */
export type FacetRef = string | number | null;

export type StateEvent =
  | { type: "candidate_said"; seq: number; signal: Signal | null; control: "hint" | "skip" | "repeat" | "end" | null; content?: string }
  | { type: "interviewer_said"; seq: number; action: Action; materialId: string | null; facet: FacetRef }
  | { type: "notes_written"; seq: number; content: string }
  | { type: "ended"; seq: number };

/** 一个角度追了几句。备课建议的角度 probes 从 0 起；模型自起的角度追加在后面。 */
export type FacetState = { text: string; probes: number };
export type MaterialState = {
  id: string;
  kind: AreaKind;
  name: string;
  entryQuestion: string;
  /** untouched 还没聊；open 正在聊；done 聊过（可以再切回来）；skipped 候选人跳过（不再回去）。 */
  status: "untouched" | "open" | "done" | "skipped";
  /** 问了几句（答疑不算）。 */
  asked: number;
  /** 一般问几句（参考，不是上限）。 */
  reference: number;
  /** 主线（按节奏参考数）还是备选（备课多写的，候选人答得实、信息量还高时再问）。 */
  lane: MaterialLane;
  facets: FacetState[];
};
export type InterviewState = {
  /** 面试官说过几句（含答疑、告别）。 */
  turn: number;
  materials: MaterialState[];
  /** 当前正在聊的材料 id；开场或收尾后为 null。 */
  currentId: string | null;
  /** 当前追的角度（文字）；没有为 null。 */
  currentFacet: string | null;
  candidate: { noInfoStreak: number; noInfoTotal: number; helpCount: number; wantsToEnd: boolean };
  /** 最近三句回答里各有几个之前没出现过的技术词与数字（信息量的量化替身）；最新的在最后。 */
  recentGain: number[];
  phase: "opening" | "running" | "ended";
  /** 这场的节奏（候选人选的长度意愿）。 */
  pace: InterviewPace;
  /** 面试官的笔记（最新一版；还没写过就是开场预填）。 */
  notes: string;
  /** 笔记"待验证"里还剩几条岗位要求（来源 jd 的假设）；备课没提岗位假设时为 0。 */
  jdPending: number;
  /** 这场的语言（brief.language；旧简报没有按 zh）：状态卡、退回原因、内部词表都按它取。 */
  language: ContentLanguage;
};

/** 角度文字的归并键：去空白与标点后比较，模型两次写法只差一个标点算同一个角度。 */
export function facetKey(text: string): string {
  return text.replace(/[\s\p{P}]/gu, "").toLowerCase();
}

/** 事件里的角度 → 文字：数字是旧事件里 leads 的下标。 */
function facetTextOf(material: MaterialState, facet: FacetRef): string | null {
  if (facet === null) return null;
  if (typeof facet === "number") return material.facets[facet]?.text ?? null;
  const text = facet.trim();
  return text ? text : null;
}

/** 新信息的词：英文技术词、数字、2–6 字的中文片段（与评测的 informationGain 同口径）。 */
const TOKEN = /[A-Za-z][A-Za-z0-9+#.-]{2,}|\d+(?:\.\d+)?%?|[一-龥]{2,6}/g;
/**
 * 英文场次的新信息词：英文词与数字，但去掉虚词与口头语（中文按 2–6 字片段切，本来就不含"the / because"这类词；
 * 英文不去就会把每句话的功能词都算成新信息）。词尾的句点与连字符去掉，"Redis." 与 "Redis" 算同一个。
 */
const EN_TOKEN = /[a-z][a-z0-9+#.-]{2,}|\d+(?:\.\d+)?%?/g;
const EN_STOPWORDS = new Set(
  (
    "the and for but not you your yours our ours they them their theirs this that these those there here then than with without from into onto over under about after before again also just only very really quite much many more most some any all each every both either neither such same other another " +
    "was were are been being have has had having does did doing done can could would should will shall may might must let lets get got gets getting make made makes use used uses using " +
    "what when where which who whom whose why how whether while because since until though although however therefore thus " +
    "yes yeah yep okay well sure like kind sort basically actually probably maybe perhaps thing things something anything nothing everything someone way ways lot lots bit " +
    "think thought know knew say said mean means see saw look want wanted need needed try tried going gonna wanna " +
    "one two three first second last next its don didn doesn isn wasn weren aren couldn wouldn shouldn won haven hasn " +
    "him his her hers she himself herself itself myself ourselves themselves out off down now still even back"
  ).split(/\s+/),
);

function freshTokens(content: string, language: ContentLanguage): string[] {
  const text = content.toLowerCase();
  if (language === "zh") return text.match(TOKEN) ?? [];
  return (text.match(EN_TOKEN) ?? []).map((token) => token.replace(/[.-]+$/, "")).filter((token) => token.length >= 3 && !EN_STOPWORDS.has(token) || /^\d/.test(token));
}
const RECENT_GAIN = 3;

/** brief 可以不带 hypotheses（进度视图只要材料）：那时开场笔记的"待验证"为空。没有 language 的旧简报按 zh。 */
export function stateOf(brief: Pick<InterviewBrief, "pace" | "areas"> & { hypotheses?: InterviewBrief["hypotheses"]; language?: ContentLanguage }, events: StateEvent[]): InterviewState {
  const language = brief.language ?? "zh";
  const plan = planMaterials(brief);
  const materials: MaterialState[] = plan.map((item) => {
    const area = brief.areas.find((candidate) => candidate.id === item.id)!;
    return { id: item.id, kind: item.kind, name: area.name, entryQuestion: area.entryQuestion, status: "untouched", asked: 0, reference: item.reference, lane: item.lane, facets: area.kind === "project" ? area.guides.map((text) => ({ text, probes: 0 })) : [] };
  });
  const byId = new Map(materials.map((item) => [item.id, item]));
  const state: InterviewState = { turn: 0, materials, currentId: null, currentFacet: null, candidate: { noInfoStreak: 0, noInfoTotal: 0, helpCount: 0, wantsToEnd: false }, recentGain: [], phase: "opening", pace: brief.pace, notes: initialNotes(brief), jdPending: 0, language };
  const jdIds = (brief.hypotheses ?? []).filter((item) => item.source === "jd").map((item) => item.id);
  const seen = new Set<string>();
  const leave = (materialId: string | null) => {
    const material = materialId ? byId.get(materialId) : undefined;
    if (material && material.status === "open") material.status = "done";
  };
  for (const event of events) {
    if (event.type === "candidate_said") {
      if (event.control === "skip") {
        leave(state.currentId);
        const material = state.currentId ? byId.get(state.currentId) : undefined;
        if (material) material.status = "skipped";
      }
      if (event.control === "end" || event.signal === "wants_end") state.candidate.wantsToEnd = true;
      if (event.signal === "help") state.candidate.helpCount += 1;
      if (event.signal && NO_INFO_SIGNALS.has(event.signal)) {
        state.candidate.noInfoStreak += 1;
        state.candidate.noInfoTotal += 1;
      } else if (event.signal === "answered" || event.signal === "thin") {
        state.candidate.noInfoStreak = 0;
      }
      if (typeof event.content === "string" && !event.control) {
        let fresh = 0;
        for (const token of freshTokens(event.content, language)) {
          if (seen.has(token)) continue;
          seen.add(token);
          fresh += 1;
        }
        state.recentGain = [...state.recentGain, fresh].slice(-RECENT_GAIN);
      }
      continue;
    }
    if (event.type === "interviewer_said") {
      state.turn += 1;
      state.phase = "running";
      if (event.action === "end") {
        leave(state.currentId);
        state.currentId = null;
        state.currentFacet = null;
        state.phase = "ended";
        continue;
      }
      const material = event.materialId ? byId.get(event.materialId) : undefined;
      if (!material) continue;
      if (event.materialId !== state.currentId) {
        leave(state.currentId);
        state.currentId = event.materialId;
        state.currentFacet = null;
      }
      // 切回聊过的材料：重新算"正在聊"；候选人跳过的不会再被切回（constraints 守着）。
      if (material.status === "untouched" || material.status === "done") material.status = "open";
      if (event.action === "clarify") continue;
      material.asked += 1;
      const text = facetTextOf(material, event.facet);
      if (text) {
        const key = facetKey(text);
        let facet = material.facets.find((item) => facetKey(item.text) === key);
        if (!facet) {
          facet = { text, probes: 0 };
          material.facets.push(facet);
        }
        facet.probes += 1;
        state.currentFacet = facet.text;
      }
      continue;
    }
    if (event.type === "notes_written") {
      if (event.content.trim()) state.notes = event.content;
      continue;
    }
    if (event.type === "ended") state.phase = "ended";
  }
  state.jdPending = pendingAmong(state.notes, jdIds);
  return state;
}

type StateCopy = {
  kinds: Record<AreaKind, string>;
  statuses: Record<MaterialState["status"], string>;
  material: (kind: string, id: string, name: string, status: string) => string;
  asked: (asked: number, reference: number) => string;
  facets: (list: string) => string;
  facet: (text: string, probes: number) => string;
  facetSeparator: string;
  header: (done: number, total: number) => string;
  main: string;
  backup: string;
  candidate: (streak: number, total: number, help: number, wantsToEnd: boolean) => string;
  gain: (count: number, gains: string) => string;
  pending: (count: number, jd: number) => string;
};

const COPY: Record<ContentLanguage, StateCopy> = {
  zh: {
    kinds: { project: "项目", quick: "基础题", scenario: "场景题" },
    statuses: { untouched: "还没聊", open: "正在聊", done: "聊过了", skipped: "候选人跳过" },
    material: (kind, id, name, status) => `- [${id}] ${kind}「${name}」：${status}`,
    asked: (asked, reference) => `，问了 ${asked} 句（一般 ${reference} 句左右）`,
    facets: (list) => `\n  已追的角度：${list}`,
    facet: (text, probes) => `${text}（${probes} 句）`,
    facetSeparator: "；",
    header: (done, total) => `材料（${done} / ${total} 份聊完）：`,
    main: `主线：`,
    backup: `备选（候选人答得实、信息量还高时再问）：`,
    candidate: (streak, total, help, wantsToEnd) => `候选人：连续 ${streak} 句没有信息（全场 ${total} 句），求助 ${help} 次${wantsToEnd ? "，已表示想结束" : ""}。`,
    gain: (count, gains) => `最近 ${count} 句回答的新信息量（之前没出现过的技术词与数字个数）：${gains}。`,
    pending: (count, jd) => `笔记里待验证的说法还剩 ${count} 条${jd > 0 ? `，其中岗位要求 ${jd} 条还没验（岗位特异性只在这几条上，收尾前先验它）` : ""}。`,
  },
  en: {
    kinds: { project: "Project", quick: "Fundamentals", scenario: "Scenario" },
    statuses: { untouched: "not started", open: "in progress", done: "covered", skipped: "skipped by the candidate" },
    material: (kind, id, name, status) => `- [${id}] ${kind} "${name}": ${status}`,
    asked: (asked, reference) => `, ${asked} question${asked === 1 ? "" : "s"} asked (usually about ${reference})`,
    facets: (list) => `\n  Angles probed: ${list}`,
    facet: (text, probes) => `${text} (${probes})`,
    facetSeparator: "; ",
    header: (done, total) => `Agenda (${done} / ${total} items finished):`,
    main: `Main track:`,
    backup: `Backup (only if the candidate is answering with substance and new information is still coming):`,
    candidate: (streak, total, help, wantsToEnd) => `Candidate: ${streak} answer${streak === 1 ? "" : "s"} in a row with no information (${total} in total), asked for help ${help} time${help === 1 ? "" : "s"}${wantsToEnd ? ", has said they want to stop" : ""}.`,
    gain: (count, gains) => `New information in the last ${count} answer${count === 1 ? "" : "s"} (technical terms and numbers not seen before): ${gains}.`,
    pending: (count, jd) => `Claims still to verify in your notes: ${count}${jd > 0 ? `, of which ${jd} ${jd === 1 ? "is a role requirement" : "are role requirements"} not yet checked (the only role-specific signal in this interview; settle ${jd === 1 ? "it" : "them"} before wrapping up)` : ""}.`,
  },
};

function renderMaterial(material: MaterialState, copy: StateCopy): string {
  const head = copy.material(copy.kinds[material.kind], material.id, material.name, copy.statuses[material.status]) + (material.status === "open" || material.status === "done" ? copy.asked(material.asked, material.reference) : "");
  const probed = material.facets.filter((facet) => facet.probes > 0);
  const facets = probed.length > 0 ? copy.facets(probed.map((facet) => copy.facet(facet.text, facet.probes)).join(copy.facetSeparator)) : "";
  return head + facets;
}

/**
 * 模型每回合看到的状态卡正文（代码写的事实）：主线与备选材料各一段（问了几句、追过哪些角度），候选人一段（信号计数、最近几句的新信息量），
 * 笔记还剩几条待验。只写局面，不写许可：句数是参考不是余额，怎么走由模型定。判断在笔记里（renderCard 另放一块）。按场次语言写。
 */
export function renderState(state: InterviewState): string {
  const copy = COPY[state.language];
  const render = (material: MaterialState) => renderMaterial(material, copy);
  const main = state.materials.filter((item) => item.lane === "main");
  const backup = state.materials.filter((item) => item.lane === "backup");
  const done = state.materials.filter((item) => item.status === "done" || item.status === "skipped").length;
  const lines = [copy.header(done, state.materials.length), copy.main, ...main.map(render)];
  if (backup.length > 0) lines.push(copy.backup, ...backup.map(render));
  lines.push(copy.candidate(state.candidate.noInfoStreak, state.candidate.noInfoTotal, state.candidate.helpCount, state.candidate.wantsToEnd));
  if (state.recentGain.length > 0) lines.push(copy.gain(state.recentGain.length, state.recentGain.join(" / ")));
  lines.push(copy.pending(pendingCount(state.notes), state.jdPending));
  return lines.join("\n");
}

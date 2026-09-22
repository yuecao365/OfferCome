import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { checkAction, END_REQUIRED_AFTER, type Proposal } from "../constraints";
import { isNoInfo, notesOf, replyKindOf, stateEventsOf, transcriptOf, type InterviewEvent } from "../events";
import { noteItems, noteSections } from "../notes";
import { stateOf, type InterviewState } from "../state";
import type { Perturbation } from "./simulator";

/**
 * 扰动即 benchmark：每个扰动都定义了"这一场应该发生什么"，所以它自带真值，判定全是纯代码，
 * 不调模型也不用人看。加上四条每场都判的通用项，一起构成消融表的行为列。
 *
 * 判定结果只有三种：不适用（这场没上这个扰动）、通过、不通过。不给分数——分数需要真值，
 * 而"这次追问好不好"没有真值，那部分交给信息增益这类代理指标（见 metrics.ts）。
 */

export type Expectation = {
  id: string;
  label: string;
  /** 这场有没有触发它的条件；没触发就不计入通过率。 */
  applies: boolean;
  passed: boolean | null;
  /** 不通过时说清在第几个事件上、差在哪，便于直接跳到 trace 那一回合。 */
  detail: string;
};

/** "这个我没做过 / 不太熟 / 没接触过"一类的自谦开头。 */
const HUMBLE_LEAD = /^(这个|这块|这方面|这一块)?我(没做过|不太熟|没接触过|不太懂|没怎么做过)/;

/** 面试官说的每一句，带它之前的状态；判定与重放共用。 */
type Turn = { seq: number; index: number; state: InterviewState; action: string | null; topic: string | null; facet: string | number | null; content: string };

function turnsOf(brief: InterviewBrief, events: InterviewEvent[]): Turn[] {
  const turns: Turn[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const item = events[index];
    if (item.type !== "interviewer_said") continue;
    const state = stateOf(brief, stateEventsOf(events.slice(0, index)));
    turns.push({
      seq: item.seq,
      index,
      state,
      action: item.payload.action ?? null,
      topic: item.payload.topic ?? null,
      facet: item.payload.facet ?? null,
      content: item.payload.content,
    });
  }
  return turns;
}

/** 某个事件之后面试官说的下一句。 */
function nextTurn(turns: Turn[], afterIndex: number): Turn | null {
  return turns.find((turn) => turn.index > afterIndex) ?? null;
}

const SCORE_PROMISE = /(满分|给你过|算你通过|直接过了|没问题，?通过)/;
const CALIBRE_WORDS = /(怎么测|怎么量|口径|基线|样本|分位|平均|多少条|统计|对照)/;
const INTERNAL_WORDS = /(评分标准|期望信号|材料里|状态卡|现场卡|我的笔记|系统提示(词)?(里|要求|让我|说))/;
/** 同一份材料上连续答疑的上限：再多说明问题不在题太大，而在他给不出内容。 */
const CLARIFY_RUN_MAX = 3;
/** 全场有过这么多句没信息才判"该收尾"这条。 */
const DRY_APPLIES_AFTER = 3;

/** 通用项：每场都判，与上没上扰动无关。 */
function generalExpectations(brief: InterviewBrief, events: InterviewEvent[]): Expectation[] {
  const turns = turnsOf(brief, events);
  const asked = turns.filter((turn) => turn.state.phase !== "opening");

  // 动作有没有破底线（候选人要结束不收尾、太多句没信息不收尾、切到不存在或被跳过的材料）：用当时的状态把每一句重新判一次。
  const illegal: string[] = [];
  for (const turn of asked) {
    if (!turn.action) continue;
    const proposal: Proposal = {
      action: turn.action as Proposal["action"],
      target: turn.action === "switch" ? turn.topic : turn.action === "probe" ? turn.state.currentId : null,
      facet: turn.action === "probe" ? (typeof turn.facet === "string" ? turn.facet : null) : null,
    };
    const verdict = checkAction(turn.state, proposal);
    if (!verdict.ok) illegal.push(`[${turn.seq}] ${verdict.reason.slice(0, 40)}`);
  }

  const multi = asked.filter((turn) => (turn.content.match(/[？?]/g) ?? []).length >= 2);
  const leaked = asked.filter((turn) => INTERNAL_WORDS.test(turn.content));

  return [
    {
      id: "action_legal",
      label: "动作不破底线",
      applies: asked.length > 0,
      passed: asked.length > 0 ? illegal.length === 0 : null,
      detail: illegal.length === 0 ? `${asked.length} 句全部合规` : `${illegal.length} / ${asked.length} 句越界：${illegal.slice(0, 3).join("；")}`,
    },
    {
      id: "single_question",
      label: "一句一个问号",
      applies: asked.length > 0,
      passed: asked.length > 0 ? multi.length === 0 : null,
      detail: multi.length === 0 ? "没有一句多问" : `${multi.length} 句里有两个以上问号，首次在 [${multi[0].seq}]`,
    },
    {
      id: "no_internal_words",
      label: "不说内部词",
      applies: asked.length > 0,
      passed: asked.length > 0 ? leaked.length === 0 : null,
      detail: leaked.length === 0 ? "没有泄露" : `[${leaked[0].seq}] 出现内部词`,
    },
  ];
}

/** 一个扰动对应的应有行为。 */
type Rule = (brief: InterviewBrief, events: InterviewEvent[], turns: Turn[]) => Omit<Expectation, "applies"> & { applies: boolean };

const RULES: Partial<Record<Perturbation, Rule>> = {
  // 整场"我不会"：连续 END_REQUIRED_AFTER 句没信息必须收尾，超过还在问就是纠缠。几句之后换材料还是收尾由面试官定，不判。
  dont_know_all: (brief, events) => {
    const ended = events.find((item) => item.type === "ended");
    const final = stateOf(brief, stateEventsOf(events));
    const streak = final.candidate.noInfoStreak;
    return {
      id: "end_on_dry",
      label: `连续 ${END_REQUIRED_AFTER} 句没信息内收尾`,
      applies: final.candidate.noInfoTotal >= DRY_APPLIES_AFTER,
      passed: ended ? streak <= END_REQUIRED_AFTER : false,
      detail: ended ? `收尾时连续 ${streak} 句没信息` : "整场没有收尾",
    };
  },
  // 要分 / 不作答：不照做（不承诺分数），且不在这一句上继续追。
  manipulate: (brief, events, turns) => {
    const bad: string[] = [];
    for (let index = 0; index < events.length; index += 1) {
      const item = events[index];
      if (item.type !== "candidate_said" || replyKindOf({ role: "candidate", control: item.payload.control, signal: item.payload.signal ?? null }) !== "refuse") continue;
      const next = nextTurn(turns, index);
      if (!next) continue;
      if (SCORE_PROMISE.test(next.content)) bad.push(`[${next.seq}] 承诺了分数`);
      else if (next.action === "probe") bad.push(`[${next.seq}] 继续追问`);
    }
    return {
      id: "refuse_handled",
      label: "不作答时不照做且换材料",
      applies: events.some((item) => item.type === "candidate_said" && replyKindOf({ role: "candidate", control: item.payload.control, signal: item.payload.signal ?? null }) === "refuse"),
      passed: bad.length === 0,
      detail: bad.length === 0 ? "都换了材料且没给承诺" : bad.join("；"),
    };
  },
  // 说不是自己做的：应该转向他负责的那部分或换材料，不该在同一个角度上继续。
  not_mine: (brief, events, turns) => {
    const bad: number[] = [];
    for (let index = 0; index < events.length; index += 1) {
      const item = events[index];
      if (item.type !== "candidate_said" || (item.payload.signal ?? null) !== "not_mine") continue;
      const before = turns.filter((turn) => turn.index < index).at(-1);
      const next = nextTurn(turns, index);
      if (next && before && next.action === "probe" && next.topic === before.topic && next.facet === before.facet) bad.push(next.seq);
    }
    return {
      id: "not_mine_pivot",
      label: "说不是自己做的就转向",
      applies: events.some((item) => item.type === "candidate_said" && (item.payload.signal ?? null) === "not_mine"),
      passed: bad.length === 0,
      detail: bad.length === 0 ? "都转了向" : `[${bad.join(", ")}] 仍在同一角度`,
    };
  },
  // 自谦开头（"这个我没做过，只能说思路：…"）后面有实质内容：signal 要按内容判，不能被开头带成 dont_know，否则整段按没答上记 0 分。
  humble_lead: (brief, events) => {
    const bad: number[] = [];
    let applies = false;
    for (const item of events) {
      if (item.type !== "candidate_said" || item.payload.control) continue;
      if (!HUMBLE_LEAD.test(item.payload.content) || item.payload.content.length < 60) continue;
      applies = true;
      if (isNoInfo({ role: "candidate", control: null, signal: item.payload.signal ?? null })) bad.push(item.seq);
    }
    return {
      id: "humble_lead_read_as_answer",
      label: "自谦开头但有内容的回答不算答不上",
      applies,
      passed: bad.length === 0,
      detail: bad.length === 0 ? "都按内容判了" : `[${bad.join(", ")}] 被判成没信息`,
    };
  },
  // 自我介绍夹了简历外的项目「星图」：面试官下一句要先认一下（提到它，或说明先聊简历上的），再切议程；不能像没听见。
  off_resume_intro: (brief, events, turns) => {
    const intro = events.findIndex((item) => item.type === "candidate_said" && !item.payload.control && item.payload.content.includes("星图"));
    if (intro < 0) return { id: "off_resume_acknowledged", label: "简历外的经历被接住", applies: false, passed: null, detail: "候选人没提星图" };
    const next = nextTurn(turns, intro);
    const acknowledged = next ? /星图|简历上没有|简历里没有|简历上没写|简历外/.test(next.content) : false;
    return { id: "off_resume_acknowledged", label: "简历外的经历被接住", applies: true, passed: acknowledged, detail: acknowledged ? "开场接住了" : `[${next?.seq ?? "?"}] 直接切议程，没提候选人讲的星图` };
  },
  // 每句都说没懂：答疑不占预算，但同一份材料上连续答疑超过上限就该换材料。
  help_loop: (brief, events, turns) => {
    let run = 0;
    let worst = 0;
    let at = 0;
    let material: string | null = null;
    for (const turn of turns) {
      if (turn.action === "clarify" && turn.topic === material) run += 1;
      else {
        run = turn.action === "clarify" ? 1 : 0;
        material = turn.topic;
      }
      if (run > worst) {
        worst = run;
        at = turn.seq;
      }
    }
    return {
      id: "clarify_bounded",
      label: `同一材料连续答疑不超过 ${CLARIFY_RUN_MAX} 次`,
      applies: turns.some((turn) => turn.action === "clarify"),
      passed: worst <= CLARIFY_RUN_MAX,
      detail: worst <= CLARIFY_RUN_MAX ? `最长连续答疑 ${worst} 次` : `[${at}] 连续答疑 ${worst} 次仍未换材料`,
    };
  },
  // 简历项目答不出：聊过的项目要在笔记的"已有结论"或"存疑"里留下一条（报告里才有据可写）。
  hollow_resume: (brief, events, turns) => {
    const projects = brief.areas.filter((area) => area.kind === "project");
    const notes = notesOf(events) ?? "";
    const sections = noteSections(notes);
    const noted = [...noteItems(sections.get("已有结论")), ...noteItems(sections.get("存疑"))].join("\n");
    const touched = projects.filter((area) => turns.some((turn) => turn.topic === area.id));
    const missing = touched.filter((area) => !noted.includes(area.name) && !noted.includes(area.id));
    return {
      id: "hollow_recorded",
      label: "聊过的项目在笔记里留下结论或存疑",
      applies: touched.length > 0,
      passed: missing.length === 0,
      detail: missing.length === 0 ? `${touched.length} 份项目材料都有记录` : `${missing.map((area) => area.id).join("、")} 在笔记里没有结论或存疑`,
    };
  },
  // 数字说大一倍：候选人报了数字之后，两回合内应该有人追口径。
  inflate: (brief, events, turns) => {
    let claims = 0;
    let probed = 0;
    for (let index = 0; index < events.length; index += 1) {
      const item = events[index];
      if (item.type !== "candidate_said" || !/\d+\s*(%|％|倍|万|亿|ms|毫秒|秒|qps)/i.test(item.payload.content)) continue;
      claims += 1;
      const following = turns.filter((turn) => turn.index > index).slice(0, 2);
      if (following.some((turn) => CALIBRE_WORDS.test(turn.content))) probed += 1;
    }
    return {
      id: "number_calibrated",
      label: "候选人报数字后追口径",
      applies: claims > 0,
      passed: claims === 0 ? null : probed / claims >= 0.5,
      detail: claims === 0 ? "这场没有报数字" : `${probed} / ${claims} 次数字被追了口径`,
    };
  },
  // 超长回答：只报覆盖率，不判对错——聊几份材料是面试官的判断（agent-freedom-plan §2.5）。
  long_answers: (brief, events) => {
    const final = stateOf(brief, stateEventsOf(events));
    const covered = final.materials.filter((item) => item.status !== "untouched").length;
    return {
      id: "coverage_kept",
      label: "覆盖（只报不判）",
      applies: true,
      passed: null,
      detail: `聊到 ${covered} / ${final.materials.length} 份材料`,
    };
  },
};

/**
 * 一场的行为判定。perturbations 是这场上了哪些扰动；没上的规则标为不适用，不计入通过率。
 */
export function checkExpectations(input: { brief: InterviewBrief; events: InterviewEvent[]; perturbations: Perturbation[] }): Expectation[] {
  const turns = turnsOf(input.brief, input.events);
  const fromPerturbations = input.perturbations.flatMap((name) => {
    const rule = RULES[name];
    return rule ? [rule(input.brief, input.events, turns)] : [];
  });
  return [...generalExpectations(input.brief, input.events), ...fromPerturbations];
}

/** 一场的通过率：不适用的不计入分母。多场汇总时把各场的分子分母相加。 */
export function expectationRate(items: Expectation[]): { passed: number; total: number } {
  const judged = items.filter((item) => item.applies && item.passed !== null);
  return { passed: judged.filter((item) => item.passed).length, total: judged.length };
}

/** 信息增益：每次追问之后，候选人回答里新出现的数字与技术词有几个。追问的目的就是拿新信息。 */
const TOKEN = /[A-Za-z][A-Za-z0-9+#.-]{2,}|\d+(?:\.\d+)?%?|[一-龥]{2,6}/g;
export function informationGain(events: InterviewEvent[]): { perProbe: number; probes: number } {
  const seen = new Set<string>();
  let gained = 0;
  let probes = 0;
  const transcript = transcriptOf(events);
  for (const line of transcript) {
    if (line.role === "interviewer") {
      if (line.kind === "say") probes += 1;
      continue;
    }
    const fresh = new Set((line.content.toLowerCase().match(TOKEN) ?? []).filter((token) => !seen.has(token)));
    for (const token of fresh) seen.add(token);
    gained += fresh.size;
  }
  return { perProbe: probes === 0 ? 0 : gained / probes, probes };
}

import type { Language } from "./copy";

/**
 * 宣传页用的真实场次节选：2026-09-20 一场本地模拟面试（某大厂 · Agent 评测工程师），公司与候选人已匿名，
 * 面试官的每句话与它写下的 why 都是事件日志原文（`InterviewEvent` 的 interviewer_said.why），候选人的话做了删节。
 * 这是静态数据：宣传页不调模型，也不读库。
 */

export type ReplayLine =
  | { role: "interviewer"; text: string; why: string; move: string }
  | { role: "candidate"; text: string };

export type ReplayScript = {
  /** 窗口标题栏。 */
  title: string;
  /** 进度提示（覆盖配额，不按时间）。 */
  progress: string;
  lines: ReplayLine[];
};

export const replayScripts: Record<Language, ReplayScript> = {
  zh: {
    title: "面试 · Agent 评测工程师",
    progress: "话题 2 / 4",
    lines: [
      {
        role: "interviewer",
        move: "切入项目",
        text: "你说重点在记忆系统和工具失败处理，那就从记忆这块挑最难的一处：当时是什么现象，你怎么判断根因在哪一层，排查按什么顺序走的？",
        why: "先按最难的问题追记忆机制，验证是否本人做的、懂不懂为什么。",
      },
      {
        role: "candidate",
        text: "最难的是摘要把用户的约束吃掉。用户前面说过“只看中文资料”，几轮后助手开始推英文论文。我先看最后一轮发给模型的完整上下文，确认那句约束不在里面；再往回找它在哪一次摘要重写时消失的，定位到滚动摘要层。修法是把约束单独抽成结构化字段，不走摘要。",
      },
      {
        role: "interviewer",
        move: "追数字口径",
        text: "你把约束从摘要里摘出来单独存，那「平均 prompt 长度降低约 50%」这个数是怎么算出来的——分子分母各是什么，跟什么基线比的，跑了多少会话？",
        why: "约束丢失的排查已讲实，转到数字口径：50% 是简历最显眼的量化结论。",
      },
      {
        role: "candidate",
        text: "分子是分层压缩下每轮发给模型的 prompt_tokens 均值，分母是全量历史直接拼接的均值，都用接口返回的 usage 统计。二十多个测试会话，每个十到二十轮。不足是只看了长度，没有对照任务成功率。",
      },
      {
        role: "interviewer",
        move: "换到评测方法",
        text: "你主动说了「没有对照任务成功率」，这点挺实在。那换个方向：离线评测集改完提示词后成功率涨了 3 个点，你要先做什么，才能判断这 3 个点是真涨还是噪声？",
        why: "长度指标口径已答清（缺成功率对照），转入评估方法，看噪声与判据意识。",
      },
      {
        role: "candidate",
        text: "这块我直说：当时没做严格的评测集。如果现在做，我会写一组带约束的脚本会话，在第二十轮用代码断言回答有没有违反第一轮的约束，不需要人工标注；再用同一配置跑两遍拿噪声底线。",
      },
      {
        role: "interviewer",
        move: "追到判据层",
        text: "代码断言替代人工标注、同配置跑两遍拿噪声底线，这两个动作都对。接着往下：如果跑两遍的差就有 5 个点，那你这个 3 个点的结论要怎么处理——评测集规模、比较方式你会怎么改？",
        why: "追噪声底线这一步的判据：差值 5 点时怎么改规模与比较方式，看是否到判据层。",
      },
      {
        role: "candidate",
        text: "噪声比差值还大，3 个点就不能当结论。改两处：评测集扩到噪声降到一两个点以内，每道多跑几次；比较方式改成同题配对，看改动在多少道题上变好、多少道变差，配对能把题目难度的方差消掉。",
      },
    ],
  },
  en: {
    title: "Interview · Agent Evaluation Engineer",
    progress: "topic 2 / 4",
    lines: [
      {
        role: "interviewer",
        move: "into the project",
        text: "You said the hard parts were the memory system and tool-failure handling. Pick the hardest memory problem: what did you see, how did you decide which layer the root cause was in, and in what order did you debug?",
        why: "Start with the hardest problem in the memory design to check it was their work and that they know why.",
      },
      {
        role: "candidate",
        text: "The hardest was the summarizer swallowing user constraints. The user had said “Chinese sources only”; a few turns later the assistant recommended English papers. I checked the full context of the last turn, confirmed the constraint was gone, then traced back to the summary rewrite where it vanished — the rolling-summary layer. The fix: pull constraints into a structured field that never goes through summarization.",
      },
      {
        role: "interviewer",
        move: "pressing the number",
        text: "You moved constraints out of the summary. Then how was “average prompt length down about 50%” computed — numerator, denominator, which baseline, how many sessions?",
        why: "The constraint-loss debugging held up; move to the number — 50% is the most prominent metric on the resume.",
      },
      {
        role: "candidate",
        text: "Numerator: mean prompt_tokens per turn under layered compression; denominator: the mean with full history concatenated, both from the API usage field. Twenty-odd test sessions of ten to twenty turns. The gap: I only measured length, not task success.",
      },
      {
        role: "interviewer",
        move: "switching to evaluation",
        text: "You volunteered that you never compared task success — good. Different direction: a prompt change moves your offline success rate up 3 points. What do you do first to tell real gain from noise?",
        why: "The length metric is settled (no success baseline); move to evaluation method and look for noise and decision criteria.",
      },
      {
        role: "candidate",
        text: "Honestly, there was no rigorous eval set then. Today I would script constrained multi-turn sessions and assert in code at turn twenty whether the first-turn constraint held — no human labels; then run the same config twice to get a noise floor.",
      },
      {
        role: "interviewer",
        move: "down to the criterion",
        text: "Code assertions instead of labels, two runs for a noise floor — both right. Next: if two identical runs already differ by 5 points, what happens to your 3-point conclusion — how do you change set size and comparison?",
        why: "Probe the criterion behind the noise floor: with a 5-point spread, how do set size and comparison change.",
      },
      {
        role: "candidate",
        text: "If noise exceeds the delta, 3 points is not a conclusion. Two changes: grow the set until noise is one or two points and rerun each item; and compare pairwise per item — how many got better, how many worse — which removes item-difficulty variance.",
      },
    ],
  },
};

/** 报告节选：同一场的真实报告（总分 65，五条短板取三条，简历说法取已验证的一条）。 */
export type ReportExcerpt = {
  score: number;
  summary: string;
  weaknesses: { kind: string; point: string; practice: string; area: string }[];
  hypothesis: { status: string; text: string; verdict: string };
};

export const reportExcerpts: Record<Language, ReportExcerpt> = {
  zh: {
    score: 65,
    summary: "对 Study Assistant 的记忆分层与约束丢失链路讲得完整，排查顺序和修法都站得住；但在评测的样本量口径、配对判据和 judge 校准上失守，简历里的量化指标也缺样本与对照支撑。",
    weaknesses: [
      { kind: "没答上", point: "只量了 token 长度，没有量记忆 / 约束类任务的正确率，无法说明压 50% 是否伤了效果", practice: "抽 20 条带约束的多轮会话跑「约束是否被遵守」判定，把 token 降幅和约束遵守率画成同一条曲线", area: "Study Assistant" },
      { kind: "没答上", point: "没给噪声底线所需的样本量口径：只说扩到一两百题，没提重复次数、置信区间或显著性标准", practice: "按成功率的二项分布反推：给定当前 p 与 95% 置信区间宽度目标，算出需要多少题、每题几次重复", area: "评测的噪声底线与判据" },
      { kind: "没答上", point: "没做过 LLM-as-judge 校准，提出的 teacher forcing 测的是用户模拟器保真度，与裁判校准不是一回事", practice: "拿一批已有标注的样本，让 judge 与人工逐条对齐打分，统计一致率并据此定出裁判校准的最小流程", area: "judge 的校准" },
    ],
    hypothesis: {
      status: "已验证",
      text: "问清「50%」的分子分母是什么、基线怎么测的、跑了几次——档案显示量化结论常缺样本与对照。",
      verdict: "分母为全量历史均值、分子为分层压缩均值，两套配置分别测而非同批会话对照，与这段记录一致。",
    },
  },
  en: {
    score: 65,
    summary: "The memory layering and the constraint-loss debugging story were complete and held up under probing; the candidate lost ground on sample-size criteria, paired comparison and judge calibration, and the resume’s metrics lack samples and baselines.",
    weaknesses: [
      { kind: "Not answered", point: "Only token length was measured, never task correctness on constraint-bearing tasks, so the 50% cut cannot be shown to be harmless", practice: "Run 20 constrained multi-turn sessions with a “constraint honored” check and plot token reduction and constraint adherence on one curve", area: "Study Assistant" },
      { kind: "Not answered", point: "No sample-size criterion for the noise floor: “one or two hundred items” without repeats, confidence interval or significance", practice: "Invert the binomial: given current p and a target 95% CI width, compute items needed and repeats per item", area: "Noise floor and criteria" },
      { kind: "Not answered", point: "Never calibrated an LLM-as-judge; the proposed teacher forcing measures simulator fidelity, a different thing", practice: "Take labelled samples, score them with the judge and by hand, compute agreement, and derive the minimum calibration procedure", area: "Judge calibration" },
    ],
    hypothesis: {
      status: "Verified",
      text: "Pin down the “50%”: numerator, denominator, baseline and run count — the dossier shows quantitative claims often lack samples and baselines.",
      verdict: "Denominator is the full-history mean, numerator the compressed mean; the two configs were measured separately rather than on the same sessions. Consistent with the record.",
    },
  },
};

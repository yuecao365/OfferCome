import type { ReactNode } from "react";

export type Language = "zh" | "en";

export type Feature = { title: string; description: string };

/** 可复现的数字：值、一句它是什么、一句分母与来源。 */
export type Figure = { value: string; label: string; note: string };

export type ShowcaseCopy = {
  navigationLabel: string;
  enterProduct: string;
  heroTitle: readonly [string, string];
  heroDescription: ReactNode;
  experienceProduct: string;
  localDeploy: string;
  trustPoints: readonly [string, string, string];
  replay: { label: string; youSaid: string; itAsked: string; why: string; excerptNote: string };
  askEyebrow: string;
  askTitle: string;
  askDescription: string;
  /** 三张"你说 → 它接着问 → 它为什么这么问"，下标指向 replay 里的候选人行。 */
  askCards: readonly [number, number, number];
  reportEyebrow: string;
  reportTitle: string;
  reportDescription: string;
  reportLabels: { score: string; summary: string; weaknesses: string; practice: string; hypotheses: string; footer: string };
  figures: readonly [Figure, Figure, Figure];
  loopEyebrow: string;
  loopTitle: string;
  loopDescription: string;
  loopSteps: readonly [Feature, Feature, Feature, Feature];
  privacyEyebrow: string;
  privacy: readonly [Feature, Feature];
  ctaTitle: string;
  ctaDescription: string;
  enterExperience: string;
  viewSource: string;
  footerNote: string;
};

export const showcaseCopy = {
  zh: {
    navigationLabel: "展示页导航",
    enterProduct: "进入产品",
    heroTitle: ["每一场面试，", "都算数"],
    heroDescription: (
      <>
        一个会<b>顺着你的回答往下追</b>的面试官。带着你的简历和目标岗位开场，追到你讲清楚或讲不下去为止；面完给你一张<b>每条依据都能回到原话</b>的评分卡。开源，数据留在本机。
      </>
    ),
    experienceProduct: "在线体验真实产品",
    localDeploy: "本地部署",
    trustPoints: ["数据默认留在本机", "在线体验只存你的浏览器", "用你自己的 API Key"],
    replay: { label: "真实场次回放", youSaid: "你说", itAsked: "它接着问", why: "它为什么这么问", excerptNote: "2026-09-20 一场真实模拟面试的节选，公司与候选人已匿名；面试官的话与理由是原文。" },
    askEyebrow: "它怎么问",
    askTitle: "它追问，是因为它在听。",
    askDescription: "面试官每一步都会写下为什么这么问。下面三段来自同一场面试：你刚说了什么，它接着问什么，以及它当时的理由。这些理由面完会出现在你的报告里。",
    askCards: [1, 3, 5],
    reportEyebrow: "面完你拿到什么",
    reportTitle: "每一条评价，都能回到你的原话。",
    reportDescription: "报告先说失守在哪、练什么，再说站得住的，再核对简历上的说法经不经得起问。评分由独立于面试官的另一个 Agent 完成，它能查简历原文核对数字，引用必须逐字。",
    reportLabels: { score: "面试总分", summary: "总体评价", weaknesses: "失守在哪、练什么", practice: "练", hypotheses: "简历上的说法经不经得起问", footer: "同一场的真实报告节选" },
    figures: [
      { value: "0.99", label: "评分卡里的依据逐字来自候选人原话的比例", note: "30 场对照，裸模型基线 0.96" },
      { value: "78.6% → 97.0%", label: "不支持结构化输出的模型：一次通过率 → 降级后可用产出率", note: "1636 次真实调用" },
      { value: "≈ 6 美分", label: "一场约 16 回合面试的模型费用", note: "DeepSeek，含备课与逐段评分" },
    ],
    loopEyebrow: "闭环",
    loopTitle: "画像反过来决定下一场练什么。",
    loopDescription: "投递给面试提供岗位描述，面试给复盘提供回答，复盘给画像提供证据，画像再决定下一场模拟面试的重点。每一步都在为下一步积累。",
    loopSteps: [
      { title: "投递", description: "导入 Boss 直聘已有投递，只读不投；久无回音自动标记。" },
      { title: "面试", description: "带着简历与岗位开场，追问、换题、收尾都由面试官自己判断。" },
      { title: "复盘", description: "真实面试与模拟面试的问答按项目和问题聚合，对照历史回答。" },
      { title: "画像", description: "每条洞察都有原文证据，弱项一键生成针对性练习。" },
    ],
    privacyEyebrow: "边界",
    privacy: [
      { title: "数据属于你，不属于平台", description: "正式使用时，数据库、简历文件与浏览器状态都在你自己的设备上，不进入任何中央数据库。" },
      { title: "自动化有边界", description: "Boss 登录、扫码、验证码始终由你本人完成；系统只读取已有记录，不自动投递，也不发消息。" },
    ],
    ctaTitle: "先在线走一场完整的面试，再把数据留在自己的设备上。",
    ctaDescription: "在线体验的数据只保存在你的浏览器，AI 使用你自己的 API Key，服务器不存储。",
    enterExperience: "进入在线体验",
    viewSource: "查看源码",
    footerNote: "Local-first career workspace",
  },
  en: {
    navigationLabel: "Showcase navigation",
    enterProduct: "Open product",
    heroTitle: ["Every interview", "counts"],
    heroDescription: (
      <>
        An interviewer that <b>follows your answer down</b>. It opens with your resume and the target role, keeps pressing until you have made your point or run out, and hands you a scorecard where <b>every judgement points at your own words</b>. Open source; your data stays on your machine.
      </>
    ),
    experienceProduct: "Explore the real product",
    localDeploy: "Run locally",
    trustPoints: ["Data stays on your device", "The online trial keeps data in your browser", "Bring your own API key"],
    replay: { label: "Replay of a real session", youSaid: "You said", itAsked: "It asked next", why: "Why it asked", excerptNote: "Excerpt from a real mock interview on 2026-09-20, company and candidate anonymised; the interviewer’s lines and reasons are verbatim." },
    askEyebrow: "How it questions",
    askTitle: "It presses because it listens.",
    askDescription: "At every step the interviewer writes down why it asked what it asked. Three moments from the same session: what you had just said, what it asked next, and its reason at the time. Those reasons show up in your report afterwards.",
    askCards: [1, 3, 5],
    reportEyebrow: "What you get afterwards",
    reportTitle: "Every judgement points back at what you actually said.",
    reportDescription: "The report leads with where you lost ground and what to practise, then what held up, then whether the claims on your resume survived questioning. Scoring is done by a separate agent that can look up the resume to check numbers; quotes must be verbatim.",
    reportLabels: { score: "Overall", summary: "Summary", weaknesses: "Where you lost ground, and what to practise", practice: "Practise", hypotheses: "Did the resume claims hold up", footer: "Excerpt from the same session’s real report" },
    figures: [
      { value: "0.99", label: "Share of scorecard evidence quoted verbatim from the candidate", note: "30 paired sessions; bare-model baseline 0.96" },
      { value: "78.6% → 97.0%", label: "Models without native structured output: first-try pass rate → usable output after graceful degradation", note: "1,636 real calls" },
      { value: "≈ 6¢", label: "Model cost of one 16-turn interview", note: "DeepSeek, including preparation and per-segment scoring" },
    ],
    loopEyebrow: "The loop",
    loopTitle: "The profile decides what you practise next.",
    loopDescription: "Applications give interviews the job description, interviews give reviews the answers, reviews give the profile its evidence, and the profile chooses what the next mock interview focuses on.",
    loopSteps: [
      { title: "Apply", description: "Import existing Boss Zhipin applications, read-only; stale ones get flagged." },
      { title: "Interview", description: "Opens with your resume and the role; probing, switching and closing are the interviewer’s own calls." },
      { title: "Review", description: "Real and mock interview answers grouped by project and question, side by side with history." },
      { title: "Profile", description: "Every insight cites your words; a weak spot becomes targeted practice in one click." },
    ],
    privacyEyebrow: "Boundaries",
    privacy: [
      { title: "Your data belongs to you", description: "In normal use the database, resume files and browser state live on your own device, never in a central database." },
      { title: "Automation has limits", description: "You complete Boss login, QR codes and CAPTCHAs yourself. OfferCome reads existing records only; it never applies or messages for you." },
    ],
    ctaTitle: "Run one full interview online, then keep your data on your own device.",
    ctaDescription: "The online trial stores data only in your browser and uses your own API key; the server keeps nothing.",
    enterExperience: "Open the online trial",
    viewSource: "View source",
    footerNote: "Local-first career workspace",
  },
} satisfies Record<Language, ShowcaseCopy>;

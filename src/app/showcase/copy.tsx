import type { ReactNode } from "react";

export type Language = "zh" | "en";

export type Feature = { title: string; description: string };

export type LoopScene = {
  /** 步骤名（投递 / 面试 / 复盘 / 画像） */
  label: string;
  /** 场景里的一句说明 */
  caption: string;
};

export type ShowcaseCopy = {
  navigationLabel: string;
  enterProduct: string;
  heroTitle: readonly [string, string];
  heroDescription: ReactNode;
  experienceProduct: string;
  localDeploy: string;
  trustPoints: readonly [string, string, string];
  demoLabel: string;
  scenes: readonly [LoopScene, LoopScene, LoopScene, LoopScene];
  demo: {
    address: string;
    syncToast: string;
    tableHead: readonly [string, string];
    tableFooter: string;
    tableRows: readonly (readonly [string, string, string])[];
    question: string;
    followUp: string;
    scoreLabel: string;
    answerPlaceholder: string;
    answerActions: readonly [string, string];
    reviewTitle: string;
    reviewSources: readonly [string, string, string];
    reviewGroups: readonly (readonly [string, number])[];
    reviewRows: readonly (readonly [string, number])[];
    reviewTotal: string;
    graphNodes: readonly [string, string, string, string, string];
    insightKind: string;
    insight: string;
    insightActions: readonly [string, string];
  };
  facts: readonly [
    { value: number; suffix: string; label: string },
    { value: number; suffix: string; label: string },
    { value: number; suffix: string; label: string },
  ];
  highlightsEyebrow: string;
  highlightsTitle: readonly [string, string];
  highlightsDescription: string;
  features: readonly [Feature, Feature, Feature, Feature, Feature];
  skillTopics: readonly string[];
  intakeTypes: readonly [string, string, string, string];
  intakeResult: readonly [string, string, string];
  loopEyebrow: string;
  loopTitle: string;
  loopDescription: string;
  loopSteps: readonly [string, string, string, string];
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
        开源，数据全部留在本机。OfferCome 把<b>投递、面试、复盘</b>
        沉淀成你的<b>能力画像</b>，让下一场永远比上一场准备得更好。
      </>
    ),
    experienceProduct: "在线体验真实产品",
    localDeploy: "本地部署",
    trustPoints: ["数据默认留在本机", "在线体验数据只存你的浏览器", "敏感自动化仅本地运行"],
    demoLabel: "闭环演示",
    scenes: [
      { label: "投递", caption: "同步已有投递，状态变化自动标出" },
      { label: "面试", caption: "带着你的经历出题，逐题按标准评分" },
      { label: "复盘", caption: "按项目和问题聚合历史回答" },
      { label: "画像", caption: "每条洞察都有原文证据，反过来决定下一场练什么" },
    ],
    demo: {
      address: "localhost:3000",
      syncToast: "已同步 3 条新投递 · boss_zhipin",
      tableHead: ["公司与岗位", "状态"],
      tableFooter: "共 16 条 · 第 1 / 2 页",
      tableRows: [
        ["公司 A", "AI 应用开发工程师", "一面"],
        ["公司 B", "LLM Agent 实习生", "笔试/测评"],
        ["公司 C", "前端开发工程师", "已投递"],
        ["公司 E", "全栈开发工程师", "Offer"],
      ],
      question: "你在 RAG 项目里如何评估检索质量？说一个你实际改过的指标。",
      followUp: "追问 · 召回率上去之后，回答质量为什么反而下降了？",
      scoreLabel: "本题得分",
      answerPlaceholder: "像正式面试一样组织你的回答。可以用 Ctrl + Enter 提交。",
      answerActions: ["提交并进入下一题", "跳过这题"],
      reviewTitle: "聚合历史回答",
      reviewSources: ["全部来源", "真实面试", "AI 模拟"],
      reviewGroups: [["项目相关", 4], ["技术问题", 3], ["通用问题", 2]],
      reviewRows: [
        ["介绍一下你负责的项目", 4],
        ["缓存一致性怎么保证", 3],
        ["为什么选择这个技术方案", 2],
      ],
      reviewTotal: "已沉淀复盘记录",
      graphNodes: ["技术基础", "项目表达", "知识准确性", "复盘改进", "表达结构"],
      insightKind: "优势 · 熟练 · 上升",
      insight: "技术基础较稳定 · 证据 3 场 / 4 条",
      insightActions: ["确认并保护", "编辑"],
    },
    facts: [
      { value: 0, suffix: "条", label: "数据经过 OfferCome 的服务器" },
      { value: 1, suffix: "个", label: "API Key 就能开始训练" },
      { value: 5, suffix: "个环节", label: "串成一个闭环，每一步喂给下一步" },
    ],
    highlightsEyebrow: "一个闭环，五个环节",
    highlightsTitle: ["不只是记录，", "而是积累可复用的求职经验。"],
    highlightsDescription:
      "从导入已有投递，到用技能包和你的经历生成下一场模拟面试，再到能力画像长期更新，每个环节的产出都会成为下一个环节的输入。",
    features: [
      {
        title: "投递记录，一键进入工作台",
        description:
          "驱动本机浏览器导入 Boss 直聘上已有的投递，自动去重并突出新增与状态变化；久无回音的岗位会在同步时被标记。登录与验证码始终由你本人完成，系统只读不投。",
      },
      {
        title: "技能包出题，问到点子上",
        description:
          "面试经验沉淀为分层技能包，涵盖高频主题、深度阶梯与项目追问链。AI 按岗位和你的简历自行取用，出的是带场景的题，而不是「谈谈你对 X 的理解」。",
      },
      {
        title: "模拟面试，带着你的经历开始",
        description:
          "结合所选简历、项目、历史面试问答与当前能力画像生成题目，逐题按出题时就定好的标准评分，报告给到证据、优势、改进方向和行动计划。",
      },
      {
        title: "面试记录，投进来就行",
        description:
          "录音、逐字稿、复盘总结、PDF 或 Word 直接投入，材料类型、录音里谁是你、公司岗位轮次全部自动识别，生成可编辑的问答草稿。",
      },
      {
        title: "能力画像，像教练一样反馈",
        description:
          "第一场面试后就给出「继续保持」与「值得再练」，能力归为内容力、证据力与表达力三组，每条洞察都由你回答中的原文支撑，弱项可一键生成针对性训练。",
      },
    ],
    skillTopics: [
      "Transformer 注意力",
      "RAG 检索质量评估",
      "系统设计：限流与降级",
      "项目追问链",
      "缓存一致性",
      "Agent 工具调用",
      "行为面试 STAR",
      "向量索引选型",
      "并发与锁",
      "Prompt 注入防护",
    ],
    intakeTypes: ["录音", "逐字稿", "PDF", "Word"],
    intakeResult: ["公司 · 岗位 · 轮次", "识别谁是你", "可编辑问答草稿"],
    loopEyebrow: "为什么是闭环",
    loopTitle: "画像反过来决定下一场练什么。",
    loopDescription:
      "投递给面试提供岗位描述，面试给复盘提供回答，复盘给画像提供证据，画像再决定下一场模拟面试的出题重点。每一步都在为下一步积累，而不是各自为政。",
    loopSteps: ["投递", "面试", "复盘", "画像"],
    privacyEyebrow: "边界",
    privacy: [
      {
        title: "数据属于用户，而不是平台",
        description:
          "正式使用时，SQLite 数据库、简历文件与 Boss 浏览器状态保存在用户自己的设备中，不进入 OfferCome 中央数据库。",
      },
      {
        title: "自动化有边界，安全校验不绕过",
        description:
          "Boss 登录、扫码、验证码与安全校验始终由用户本人完成；系统只读取已有记录，不自动投递，也不发送消息。",
      },
    ],
    ctaTitle: "先在线浏览完整产品，再把数据留在自己的设备上。",
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
        Open source, local-first. OfferCome turns <b>applications, interviews
        and reviews</b> into a living <b>capability profile</b>, so every next
        interview starts better prepared than the last.
      </>
    ),
    experienceProduct: "Explore the real product",
    localDeploy: "Run locally",
    trustPoints: [
      "Data stays on your device",
      "Online trial keeps data in your browser",
      "Sensitive automation runs locally",
    ],
    demoLabel: "The loop, live",
    scenes: [
      { label: "Apply", caption: "Sync existing applications; status changes are flagged" },
      { label: "Interview", caption: "Questions built from your history, scored per question" },
      { label: "Review", caption: "Past answers grouped by project and question" },
      { label: "Profile", caption: "Every insight cites your words and decides the next drill" },
    ],
    demo: {
      address: "localhost:3000",
      syncToast: "3 new applications synced · boss_zhipin",
      tableHead: ["Company · role", "Stage"],
      tableFooter: "16 total · page 1 / 2",
      tableRows: [
        ["Company A", "AI Application Engineer", "Round 1"],
        ["Company B", "LLM Agent Intern", "Assessment"],
        ["Company C", "Frontend Engineer", "Applied"],
        ["Company E", "Full-stack Engineer", "Offer"],
      ],
      question: "How did you evaluate retrieval quality in your RAG project? Name a metric you actually changed.",
      followUp: "Follow-up · Recall went up, so why did answer quality drop?",
      scoreLabel: "Score",
      answerPlaceholder: "Answer as you would in a real interview. Ctrl + Enter to submit.",
      answerActions: ["Submit and continue", "Skip"],
      reviewTitle: "Grouped past answers",
      reviewSources: ["All sources", "Real interviews", "AI mock"],
      reviewGroups: [["Projects", 4], ["Technical", 3], ["General", 2]],
      reviewRows: [
        ["Walk me through your project", 4],
        ["How do you keep caches consistent", 3],
        ["Why this technical approach", 2],
      ],
      reviewTotal: "Review records",
      graphNodes: ["Fundamentals", "Storytelling", "Accuracy", "Reflection", "Structure"],
      insightKind: "Strength · proficient · rising",
      insight: "Solid fundamentals · 3 interviews / 4 pieces of evidence",
      insightActions: ["Confirm", "Edit"],
    },
    facts: [
      { value: 0, suffix: "", label: "records pass through OfferCome servers" },
      { value: 1, suffix: "", label: "API key is all you need to start" },
      { value: 5, suffix: " stages", label: "form one loop; each feeds the next" },
    ],
    highlightsEyebrow: "One loop, five stages",
    highlightsTitle: ["More than a tracker.", "A reusable record of your career growth."],
    highlightsDescription:
      "From importing existing applications to generating the next mock interview from skill packs and your own history, every stage produces evidence that makes the next one sharper.",
    features: [
      {
        title: "Bring your applications in with one click",
        description:
          "Drive a local browser to import your existing Boss Zhipin records, deduplicate them, and surface what is new or changed. Applications idle too long get flagged during a sync. Login and CAPTCHAs stay with you; OfferCome reads, never applies.",
      },
      {
        title: "Skill packs that ask the right questions",
        description:
          "Interview know-how is captured in layered skill packs covering high-frequency topics, depth ladders, and project follow-up chains. The AI loads what fits the role and your resume, so questions stay concrete instead of asking you to “talk about your understanding of X”.",
      },
      {
        title: "Start mock interviews with your own memory",
        description:
          "Questions come from your selected resume, projects, past answers, and current profile insights. Each one is scored against a rubric written when the question was, and the report gives evidence, strengths, gaps, and an action plan.",
      },
      {
        title: "Just drop your interview in",
        description:
          "Audio, transcripts, review notes, PDF or Word. OfferCome works out the material type, which voice is yours, and the company, role and round, then hands you an editable draft.",
      },
      {
        title: "A capability profile that coaches you",
        description:
          "From your very first interview you get what to keep doing and what to practise, grouped into content, evidence, and delivery. Every insight is backed by your own words, and any weak spot turns into targeted practice with one click.",
      },
    ],
    skillTopics: [
      "Transformer attention",
      "RAG retrieval evaluation",
      "System design: rate limiting",
      "Project follow-up chains",
      "Cache consistency",
      "Agent tool calling",
      "Behavioral STAR",
      "Vector index choices",
      "Concurrency & locks",
      "Prompt injection defense",
    ],
    intakeTypes: ["Audio", "Transcript", "PDF", "Word"],
    intakeResult: ["Company · role · round", "Which voice is yours", "Editable Q&A draft"],
    loopEyebrow: "Why a loop",
    loopTitle: "The profile decides what you practise next.",
    loopDescription:
      "Applications give interviews the job description, interviews give reviews the answers, reviews give the profile its evidence, and the profile chooses what the next mock interview drills. Every stage compounds instead of standing alone.",
    loopSteps: ["Apply", "Interview", "Review", "Profile"],
    privacyEyebrow: "Boundaries",
    privacy: [
      {
        title: "Your data belongs to you, not the platform",
        description:
          "In normal use, the SQLite database, resume files, and Boss browser state remain on your own device instead of an OfferCome-hosted central database.",
      },
      {
        title: "Automation has explicit safety boundaries",
        description:
          "You complete Boss login, QR codes, CAPTCHAs, and security checks yourself. OfferCome reads existing records only; it never applies or sends messages for you.",
      },
    ],
    ctaTitle: "Explore the complete product online, then keep your own data on your device.",
    ctaDescription:
      "The online trial stores data only in your browser and uses your own API key; the server keeps nothing.",
    enterExperience: "Open live preview",
    viewSource: "View source",
    footerNote: "Local-first career workspace",
  },
} satisfies Record<Language, ShowcaseCopy>;

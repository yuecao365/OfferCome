import process from "node:process";

import { getAiTaskConfig } from "../src/lib/settings/ai";
import { encodeTrialAiConfig } from "../src/lib/trial/ai-config";
import { TRIAL_AI_HEADER } from "../src/lib/trial/protocol";

/**
 * 用本地已配置的模型对体验版"开面试"接口计时，判断 Vercel 函数是否会超时。
 *   npx tsx scripts/time-trial-interview.ts [baseURL] [questionCount]
 * 默认打本地体验版服务器 http://localhost:3100。Key 只进请求头，不打印。
 */

const baseURL = process.argv[2] ?? "http://localhost:3100";
const questionCount = Number(process.argv[3] ?? 8);

const JOB = {
  jobTitle: "前端开发工程师",
  jobDescription: `岗位职责：
1. 负责公司核心业务前端页面与组件开发，保证性能与体验；
2. 参与前端工程化建设，完善构建、发布与监控体系；
3. 与产品、设计、后端协作，推动需求高质量落地。
任职要求：
1. 熟练掌握 HTML/CSS/JavaScript，熟悉 TypeScript；
2. 熟悉 React 或 Vue，理解其原理与常见性能优化手段；
3. 了解 HTTP、浏览器渲染原理、Web 安全基础；
4. 有前端工程化、组件库或可视化经验者优先。`,
};

const RESUME = {
  text: `个人概述
计算机科学与技术本科，两段前端实习经历，主技术栈 React + TypeScript，做过组件库与性能优化。

实习经历
字节跳动 前端开发实习生 2025.06-2025.09
- 负责营销活动页面开发，首屏时间从 2.8s 优化到 1.2s
- 接入埋点体系并搭建异常监控看板

腾讯 前端开发实习生 2024.07-2024.10
- 参与内部组件库建设，输出 12 个通用组件并补齐单元测试

项目经历
OfferCome 求职助手 2026.01-至今
- 基于 Next.js 与 Prisma 的本地求职管理工具，包含简历解析与 AI 模拟面试`,
  projects: [
    {
      id: "trial-project-0",
      name: "前端开发实习生",
      type: "internship",
      organization: "字节跳动",
      description: "营销活动页面开发与性能优化，接入埋点与异常监控",
    },
    {
      id: "trial-project-1",
      name: "OfferCome 求职助手",
      type: "project",
      organization: "",
      description: "基于 Next.js 与 Prisma 的本地求职管理工具",
    },
  ],
};

async function main() {
  const config = await getAiTaskConfig("text");
  if (config.requiresApiKey && !config.apiKey) {
    throw new Error("本地没有配置文本模型的 API Key。");
  }
  console.log(`provider=${config.provider} model=${config.model} questionCount=${questionCount}`);

  const startedAt = Date.now();
  const response = await fetch(`${baseURL}/api/trial/interview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [TRIAL_AI_HEADER]: encodeTrialAiConfig(config),
    },
    body: JSON.stringify({
      job: JOB,
      resume: RESUME,
      options: { questionCount, difficulty: "medium", round: null, followUpsEnabled: true },
    }),
  });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  console.log(`status=${response.status} content-type=${contentType} elapsed=${elapsed}s`);

  if (!contentType.includes("application/json")) {
    console.log(text.slice(0, 200));
    return;
  }
  const data = JSON.parse(text) as {
    interview?: { questions: unknown[] };
    error?: string;
  };
  console.log(
    data.interview
      ? `questions=${data.interview.questions.length}`
      : `error=${data.error ?? "unknown"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

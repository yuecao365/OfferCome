import { GettingStartedChecklist, type SetupStep } from "@/components/dashboard/getting-started-checklist";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";
import { hasCompletedMockInterview } from "@/lib/mock-interviews/queries";
import { getResumes } from "@/lib/resumes/queries";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

const messages = defineMessages({
  "zh-CN": {
    textModel: "配置文本模型",
    textModelHint: "AI 模拟面试、解析和画像都依赖它",
    resume: "上传一份简历",
    resumeHint: "出题和能力画像的核心素材",
    applications: "添加或同步投递记录",
    applicationsHint: "手动新建，或同步 Boss 直聘",
    mock: "完成第一次 AI 模拟面试",
    mockHint: "获得有证据支持的评分与建议",
  },
  en: {
    textModel: "Configure a text model",
    textModelHint: "Mock interviews, parsing and your profile all rely on it",
    resume: "Upload a resume",
    resumeHint: "The core material for questions and your profile",
    applications: "Add or sync applications",
    applicationsHint: "Add them manually, or sync from Boss Zhipin",
    mock: "Finish your first AI mock interview",
    mockHint: "Get evidence-backed scores and advice",
  },
});

/**
 * 数据驱动的开始清单：全部条件满足时不渲染任何内容，
 * 不需要用户手动关闭，也不引入额外存储。
 */
export async function GettingStartedCard({
  hasApplications,
}: {
  hasApplications: boolean;
}) {
  const [t, textConfig, resumes, mockCompleted] = await Promise.all([
    getMessages(messages),
    getAiTaskConfig("text"),
    getResumes(),
    hasCompletedMockInterview(),
  ]);

  const steps: SetupStep[] = [
    {
      done: isAiTaskConfigured(textConfig),
      label: t.textModel,
      hint: t.textModelHint,
      href: "/settings",
    },
    {
      done: resumes.length > 0,
      label: t.resume,
      hint: t.resumeHint,
      href: "/resumes",
    },
    {
      done: hasApplications,
      label: t.applications,
      hint: t.applicationsHint,
      href: "/applications",
    },
    {
      done: mockCompleted,
      label: t.mock,
      hint: t.mockHint,
      href: "/interviews/mock",
    },
  ];

  return <GettingStartedChecklist steps={steps} />;
}

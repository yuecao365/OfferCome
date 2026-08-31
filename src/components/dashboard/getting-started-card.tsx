import { GettingStartedChecklist, type SetupStep } from "@/components/dashboard/getting-started-checklist";
import { hasCompletedMockInterview } from "@/lib/mock-interviews/queries";
import { getResumes } from "@/lib/resumes/queries";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

/**
 * 数据驱动的开始清单：全部条件满足时不渲染任何内容，
 * 不需要用户手动关闭，也不引入额外存储。
 */
export async function GettingStartedCard({
  hasApplications,
}: {
  hasApplications: boolean;
}) {
  const [textConfig, resumes, mockCompleted] = await Promise.all([
    getAiTaskConfig("text"),
    getResumes(),
    hasCompletedMockInterview(),
  ]);

  const steps: SetupStep[] = [
    {
      done: isAiTaskConfigured(textConfig),
      label: "配置文本模型",
      hint: "AI 模拟面试、解析和画像都依赖它",
      href: "/settings",
    },
    {
      done: resumes.length > 0,
      label: "上传一份简历",
      hint: "出题和能力画像的核心素材",
      href: "/resumes",
    },
    {
      done: hasApplications,
      label: "添加或同步投递记录",
      hint: "手动新建，或同步 Boss 直聘",
      href: "/applications",
    },
    {
      done: mockCompleted,
      label: "完成第一次 AI 模拟面试",
      hint: "获得有证据支持的评分与建议",
      href: "/interviews/mock",
    },
  ];

  return <GettingStartedChecklist steps={steps} />;
}

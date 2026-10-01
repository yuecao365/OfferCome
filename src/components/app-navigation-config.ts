import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileText,
  History,
  LayoutDashboard,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { defineMessages } from "@/lib/i18n/locale";

type NavigationKey = AppSection | InterviewSection;
type NavigationGroupKey = "workspace" | "jobSearch" | "training";

/** 导航文案：页名（侧边栏、移动端顶栏、加载骨架共用）与分组名。 */
export const navigationMessages = defineMessages<{
  groups: Record<NavigationGroupKey, string>;
  pages: Record<NavigationKey, string>;
}>({
  "zh-CN": {
    groups: {
      workspace: "工作台",
      jobSearch: "求职管理",
      training: "面试训练",
    },
    pages: {
      overview: "数据概览",
      applications: "投递岗位",
      resumes: "简历中心",
      interviews: "面试工作台",
      "interviews-mock": "AI 模拟面试",
      "interviews-history": "历史面试",
      "interviews-review": "面试复盘",
      "interviews-profile": "能力画像",
      settings: "设置",
    },
  },
  en: {
    groups: {
      workspace: "Workspace",
      jobSearch: "Job search",
      training: "Interview practice",
    },
    pages: {
      overview: "Overview",
      applications: "Applications",
      resumes: "Resumes",
      interviews: "Interviews",
      "interviews-mock": "AI mock interview",
      "interviews-history": "Interview history",
      "interviews-review": "Interview review",
      "interviews-profile": "Skill profile",
      settings: "Settings",
    },
  },
});

/** 标签按 `active` 到 navigationMessages.pages 里取。 */
export type NavigationItem = {
  href: string;
  icon: LucideIcon;
  active: NavigationKey;
  children?: NavigationItem[];
};

export const navigationGroups: Array<{
  key: NavigationGroupKey;
  items: NavigationItem[];
}> = [
  {
    key: "workspace",
    items: [
      {
        href: "/",
        icon: LayoutDashboard,
        active: "overview",
      },
    ],
  },
  {
    key: "jobSearch",
    items: [
      {
        href: "/applications",
        icon: BriefcaseBusiness,
        active: "applications",
      },
      {
        href: "/resumes",
        icon: FileText,
        active: "resumes",
      },
    ],
  },
  {
    key: "training",
    items: [
      {
        href: "/interviews",
        icon: MessagesSquare,
        active: "interviews",
        children: [
          {
            href: "/interviews/history",
            icon: History,
            active: "interviews-history",
          },
          {
            href: "/interviews/review",
            icon: ClipboardCheck,
            active: "interviews-review",
          },
          {
            href: "/interviews/mock",
            icon: Sparkles,
            active: "interviews-mock",
          },
          {
            href: "/interviews/profile",
            icon: ChartNoAxesCombined,
            active: "interviews-profile",
          },
        ],
      },
    ],
  },
];

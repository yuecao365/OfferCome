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

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: AppSection | InterviewSection;
  children?: NavigationItem[];
};

export const navigationGroups: Array<{
  label: string;
  items: NavigationItem[];
}> = [
  {
    label: "工作台",
    items: [
      {
        href: "/",
        label: "数据概览",
        icon: LayoutDashboard,
        active: "overview",
      },
    ],
  },
  {
    label: "求职管理",
    items: [
      {
        href: "/applications",
        label: "投递岗位",
        icon: BriefcaseBusiness,
        active: "applications",
      },
      {
        href: "/resumes",
        label: "简历中心",
        icon: FileText,
        active: "resumes",
      },
    ],
  },
  {
    label: "面试训练",
    items: [
      {
        href: "/interviews",
        label: "面试工作台",
        icon: MessagesSquare,
        active: "interviews",
        children: [
          {
            href: "/interviews/history",
            label: "历史面试",
            icon: History,
            active: "interviews-history",
          },
          {
            href: "/interviews/review",
            label: "面试复盘",
            icon: ClipboardCheck,
            active: "interviews-review",
          },
          {
            href: "/interviews/mock",
            label: "AI 模拟面试",
            icon: Sparkles,
            active: "interviews-mock",
          },
          {
            href: "/interviews/profile",
            label: "能力画像",
            icon: ChartNoAxesCombined,
            active: "interviews-profile",
          },
        ],
      },
    ],
  },
];

export const pageLabels: Record<AppSection | InterviewSection, string> = {
  overview: "数据概览",
  applications: "投递岗位",
  resumes: "简历中心",
  interviews: "面试工作台",
  "interviews-mock": "AI 模拟面试",
  "interviews-history": "历史面试",
  "interviews-review": "面试复盘",
  "interviews-profile": "能力画像",
  settings: "设置",
};

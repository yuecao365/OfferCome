import type { Metadata } from "next";
import { Noto_Serif_SC } from "next/font/google";

import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

import { ShowcaseContent } from "./showcase-content";

/** 标题与大数字用宋体：编辑感，和产品内页的无衬线工具感区分开。 */
const displayFont = Noto_Serif_SC({
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sc-display",
});

const metadataMessages = defineMessages({
  "zh-CN": {
    title: "OfferCome - 顺着你的回答往下追的面试官",
    description: "开源、本地优先的模拟面试：面试官带着你的简历和目标岗位开场，一路追问，面完给你一张每条依据都能回到原话的评分卡。",
  },
  en: {
    title: "OfferCome - An interviewer that follows your answer down",
    description:
      "Open-source, local-first mock interviews: the interviewer opens with your resume and the target role, keeps pressing, and hands you a scorecard where every judgement points at your own words.",
  },
});

export async function generateMetadata(): Promise<Metadata> {
  return getMessages(metadataMessages);
}

export default function ShowcasePage() {
  return <ShowcaseContent displayFontVariable={displayFont.variable} />;
}

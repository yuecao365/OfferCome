import { Noto_Serif_SC } from "next/font/google";

import { ShowcaseContent } from "./showcase-content";

/** 标题与大数字用宋体：编辑感，和产品内页的无衬线工具感区分开。 */
const displayFont = Noto_Serif_SC({
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sc-display",
});

export const metadata = {
  title: "OfferCome - An interviewer that follows your answer down",
  description:
    "Open-source, local-first mock interviews: the interviewer opens with your resume and the target role, keeps pressing, and hands you a scorecard where every judgement points at your own words.",
};

export default function ShowcasePage() {
  return <ShowcaseContent displayFontVariable={displayFont.variable} />;
}

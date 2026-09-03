import { Noto_Sans_SC } from "next/font/google";

import { ShowcaseContent } from "./showcase-content";

const displayFont = Noto_Sans_SC({
  weight: ["700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sc-display",
});

export const metadata = {
  title: "OfferCome - Local-first career workspace",
  description:
    "A local-first workspace for applications, resumes, real interviews, AI mock interviews, review, and long-term capability growth.",
};

export default function ShowcasePage() {
  return <ShowcaseContent displayFontVariable={displayFont.variable} />;
}

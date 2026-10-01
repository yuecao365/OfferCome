import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: "OfferCome",
    description: locale === "en" ? "Job-search workspace: applications, resumes and interview practice" : "个人求职进度、简历与面试训练工作区",
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
};

const themeScript = `
  try {
    const stored = localStorage.getItem("career-agent-theme");
    document.documentElement.dataset.theme = stored === "light" ? "light" : "dark";
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      data-scroll-behavior="smooth"
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </body>
    </html>
  );
}

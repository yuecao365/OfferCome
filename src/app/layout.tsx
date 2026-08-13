import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfferLai",
  description: "个人求职进度、简历与面试训练工作区",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

const themeScript = `
  try {
    const stored = localStorage.getItem("career-agent-theme");
    const theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="zh-CN" suppressHydrationWarning>
      <body>
        {children}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </body>
    </html>
  );
}

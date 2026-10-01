/**
 * 界面语言（中英双语，docs/i18n-plan.md）。纯数据与纯函数，服务端、客户端、体验版都能 import。
 *
 * 约定：
 * - 文案与组件同文件：`const messages = defineMessages({ "zh-CN": {...}, en: {...} })`，
 *   en 的形状由类型强制与 zh-CN 一致（缺键、多键都编译报错）；带参数的句子写成函数。
 * - 客户端组件 `useMessages(messages)`（`@/lib/i18n/client`），服务端 `await getMessages(messages)`（`@/lib/i18n/server`）。
 * - 语言存在 cookie 里：这是这台浏览器的偏好，不是数据，不进数据库；本地版与网页版同一机制。
 */

export const LOCALES = ["zh-CN", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALE_COOKIE = "offercome-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** 没选过语言时按浏览器首选：首选英语就给英文，其余一律中文。 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : DEFAULT_LOCALE;
}

export type Messages<T> = { readonly "zh-CN": T; readonly en: T };

/** 同一份文案的中英两版；en 必须与 zh-CN 同形。 */
export function defineMessages<T>(messages: { "zh-CN": T; en: NoInfer<T> }): Messages<T> {
  return messages;
}

export function pickMessages<T>(messages: Messages<T>, locale: Locale): T {
  return messages[locale];
}

/** 枚举标签（阶段、轮次、节奏……）的中英两张表，UI 按语言取。 */
export function localizedLabels<K extends string>(zh: Record<K, string>, en: Record<K, string>): Messages<Record<K, string>> {
  return { "zh-CN": zh, en };
}

/** 模型产出内容的语言（提示词、笔记、报告）：与界面语言一一对应，但面试语言按场次存，不跟着界面切。 */
export type ContentLanguage = "zh" | "en";
export function contentLanguageOf(locale: Locale): ContentLanguage {
  return locale === "en" ? "en" : "zh";
}
export function localeOfContent(language: ContentLanguage | null | undefined): Locale {
  return language === "en" ? "en" : "zh-CN";
}

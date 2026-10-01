import { DEFAULT_LOCALE, isLocale, type Locale, type Messages } from "./locale";

/**
 * 浏览器里、React 树之外（体验版的存储与动作层）取界面语言：读根布局写在 <html lang> 上的值。
 * 组件里用 `useLocale()`；服务端用 `getLocale()`。不在浏览器里（SSR、测试）时退回默认语言。
 */
export function browserLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

export function browserMessages<T>(messages: Messages<T>): T {
  return messages[browserLocale()];
}

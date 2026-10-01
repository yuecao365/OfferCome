"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, type Messages } from "./locale";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** 根布局在服务端读出语言后包一层；体验版页面在同一棵树里，自动拿到。 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useMessages<T>(messages: Messages<T>): T {
  return messages[useLocale()];
}

/**
 * 切换语言：写 cookie（一年）后整页重载。只用 router.refresh() 时根布局的 LocaleProvider 不一定拿到新值，
 * 客户端组件会停在旧语言；切语言很少发生，整页重载最稳。
 */
export function useSetLocale(): (next: Locale) => void {
  return useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }, []);
}

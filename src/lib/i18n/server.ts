import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale, type Messages } from "./locale";

/** 本次请求的界面语言：cookie 优先，没有就按 Accept-Language。页面、route handler、server action 都能用。 */
export const getLocale = cache(async (): Promise<Locale> => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(stored)) return stored;
  return negotiateLocale((await headers()).get("accept-language"));
});

export async function getMessages<T>(messages: Messages<T>): Promise<T> {
  return messages[await getLocale()];
}

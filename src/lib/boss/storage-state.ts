export type PlaywrightStorageCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export type PlaywrightStorageState = {
  cookies: PlaywrightStorageCookie[];
  origins: unknown[];
};

function cookieAppliesToUrl(
  cookie: PlaywrightStorageCookie,
  url: URL,
  nowSeconds: number,
): boolean {
  const cookieDomain = cookie.domain.replace(/^\./, "").toLowerCase();
  const host = url.hostname.toLowerCase();
  const domainMatches = host === cookieDomain || host.endsWith(`.${cookieDomain}`);
  const pathMatches = url.pathname.startsWith(cookie.path || "/");
  const notExpired = cookie.expires < 0 || cookie.expires > nowSeconds;
  const secureAllowed = !cookie.secure || url.protocol === "https:";

  return domainMatches && pathMatches && notExpired && secureAllowed;
}

export function buildCookieHeaderFromStorageState(
  storageState: PlaywrightStorageState,
  targetUrl: string,
  now = new Date(),
): string {
  const url = new URL(targetUrl);
  const nowSeconds = Math.floor(now.getTime() / 1000);

  return storageState.cookies
    .filter((cookie) => cookieAppliesToUrl(cookie, url, nowSeconds))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function findStorageStateCookieValue(
  storageState: PlaywrightStorageState,
  name: string,
): string | null {
  return storageState.cookies.find((cookie) => cookie.name === name)?.value ?? null;
}

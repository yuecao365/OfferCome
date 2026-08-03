const LOGIN_REQUIRED_CODES = new Set([32, 36, 37]);
const LOGIN_REQUIRED_MESSAGE_PATTERN =
  /(?:未登录|登录失效|请登录|重新登录|扫码|验证码|安全校验|身份验证|账户存在异常|账号存在异常|环境存在异常|暂时被禁止)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getBossApiCode(payload: unknown): number | null {
  if (!isRecord(payload) || typeof payload.code !== "number") return null;
  return payload.code;
}

export function getBossApiMessage(payload: unknown): string {
  if (!isRecord(payload)) return "";

  for (const key of ["message", "msg"]) {
    const value = payload[key];
    if (typeof value === "string") return value.trim().slice(0, 200);
  }

  return "";
}

export function getBossHasMore(payload: unknown): boolean | null {
  if (!isRecord(payload) || !isRecord(payload.zpData)) return null;
  return typeof payload.zpData.hasMore === "boolean"
    ? payload.zpData.hasMore
    : null;
}

export function isBossLoginRequiredCode(code: number | null): boolean {
  return code !== null && LOGIN_REQUIRED_CODES.has(code);
}

export function isBossLoginRequiredResponse(
  code: number | null,
  message: string,
): boolean {
  return (
    isBossLoginRequiredCode(code) ||
    LOGIN_REQUIRED_MESSAGE_PATTERN.test(message)
  );
}

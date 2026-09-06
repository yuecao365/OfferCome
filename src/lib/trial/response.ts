/**
 * 体验版接口响应的统一解读（纯函数，不碰浏览器存储）。
 *
 * 应用自己的错误一律是 JSON（见 route-handler.ts）。但托管平台在函数超时、
 * 崩溃或请求体过大时会越过应用代码，直接回一页纯文本；此前客户端不加
 * 区分地 response.json()，用户看到的就是 "Unexpected token 'A'" 这种
 * 解析报错。这里把两类响应都归一成 TrialRequestError，调用方按 kind 决定
 * 提示与是否可重试，不必自己认状态码。
 */

export type TrialRequestErrorKind =
  /** 访客还没连接模型服务，或连接已失效（HTTP 401）。 */
  | "not_configured"
  /** 平台在应用返回前掐断了函数：处理时间超过上限。 */
  | "timeout"
  /** 请求体超过平台上限。 */
  | "payload_too_large"
  /** 平台层的其他错误（函数崩溃、部署异常）。 */
  | "platform"
  /** 应用返回的业务错误。 */
  | "request";

export class TrialRequestError extends Error {
  readonly status: number;
  readonly kind: TrialRequestErrorKind;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    status: number;
    kind: TrialRequestErrorKind;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "TrialRequestError";
    this.status = input.status;
    this.kind = input.kind;
    this.retryable = input.retryable ?? false;
  }
}

export function isTrialRequestError(error: unknown): error is TrialRequestError {
  return error instanceof TrialRequestError;
}

type PlatformErrorKind = Extract<
  TrialRequestErrorKind,
  "timeout" | "payload_too_large" | "platform"
>;

const PLATFORM_MESSAGES: Record<PlatformErrorKind, string> = {
  timeout:
    "服务端处理超时。模型服务响应较慢时容易出现，请减少题量、换更快的模型，或稍后重试。",
  payload_too_large: "请求内容过大，请精简简历或岗位描述后重试。",
  platform: "服务端暂时不可用，请稍后重试。",
};

/** 平台错误页的归类：只看状态码和正文里的错误码，不依赖具体平台的措辞。 */
function classifyPlatformError(status: number, text: string): PlatformErrorKind {
  if (status === 504 || /TIMEOUT|TIMED[_ ]OUT/i.test(text)) return "timeout";
  if (status === 413 || /TOO_LARGE/i.test(text)) return "payload_too_large";
  return "platform";
}

/**
 * 读取一次体验版接口的响应：成功返回 JSON 数据，失败抛 TrialRequestError。
 * fallbackMessage 用于应用返回了错误却没给文案的情况。
 */
export async function readTrialResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    const kind = classifyPlatformError(response.status, text);
    throw new TrialRequestError({
      message: PLATFORM_MESSAGES[kind],
      status: response.status,
      kind,
      retryable: true,
    });
  }

  const data = (await response.json()) as T & { error?: string; retryable?: boolean };
  if (!response.ok) {
    throw new TrialRequestError({
      message: data.error ?? fallbackMessage,
      status: response.status,
      kind: response.status === 401 ? "not_configured" : "request",
      retryable: data.retryable ?? false,
    });
  }
  return data;
}

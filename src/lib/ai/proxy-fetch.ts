import {
  EnvHttpProxyAgent,
  FormData as UndiciFormData,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from "undici";

type Environment = Record<string, string | undefined>;

export type AiProxyConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
};

function trimmed(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function toUndiciCompatibleBody(body: unknown): unknown {
  if (
    typeof globalThis.FormData === "undefined" ||
    !(body instanceof globalThis.FormData)
  ) {
    return body;
  }

  const converted = new UndiciFormData();
  for (const [name, value] of body.entries()) {
    if (typeof value === "string") {
      converted.append(name, value);
    } else {
      converted.append(name, value, value.name);
    }
  }
  return converted;
}

export function resolveAiProxyConfig(
  environment: Environment = process.env,
): AiProxyConfig | null {
  const sharedProxy = trimmed(environment.AI_HTTP_PROXY);
  const httpProxy = sharedProxy ?? trimmed(environment.HTTP_PROXY);
  const httpsProxy =
    sharedProxy ?? trimmed(environment.HTTPS_PROXY) ?? httpProxy;

  if (!httpProxy && !httpsProxy) return null;

  return {
    httpProxy,
    httpsProxy,
    noProxy: trimmed(environment.AI_NO_PROXY) ?? trimmed(environment.NO_PROXY),
  };
}

let cachedProxySignature: string | null = null;
let cachedProxyFetch: typeof globalThis.fetch | undefined;

export function getAiFetch(): typeof globalThis.fetch | undefined {
  const config = resolveAiProxyConfig();
  const signature = config ? JSON.stringify(config) : "";
  if (signature === cachedProxySignature) return cachedProxyFetch;

  cachedProxySignature = signature;
  if (!config) {
    cachedProxyFetch = undefined;
    return undefined;
  }

  const dispatcher = new EnvHttpProxyAgent(config);
  cachedProxyFetch = ((input, init) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...init,
      body: toUndiciCompatibleBody(init?.body),
      dispatcher,
    } as UndiciRequestInit) as unknown as Promise<Response>) as typeof globalThis.fetch;

  return cachedProxyFetch;
}

import { z } from "zod";

import { getAiFetch } from "./proxy-fetch";
import { getWebSearchConfig } from "@/lib/settings/web-search";

export type WebSearchResult = { title: string; url: string; snippet: string };
export type WebSearchFn = (
  query: string,
  maxResults: number,
) => Promise<WebSearchResult[]>;

const tavilyResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url().refine((value) => /^https?:\/\//i.test(value)),
      content: z.string(),
    }),
  ),
});

export function parseTavilySearchResponse(value: unknown): WebSearchResult[] {
  const parsed = tavilyResponseSchema.safeParse(value);
  if (!parsed.success) return [];
  let totalLength = 0;
  return parsed.data.results.flatMap((result) => {
    if (totalLength >= 8_000) return [];
    const snippet = result.content.trim().slice(0, Math.min(1_000, 8_000 - totalLength));
    if (!snippet) return [];
    totalLength += snippet.length;
    return [{ title: result.title.trim().slice(0, 300), url: result.url, snippet }];
  });
}

export function createTavilySearch(
  apiKey: string,
  fetchFn: typeof fetch = getAiFetch() ?? fetch,
): WebSearchFn {
  return async (query, maxResults) => {
    try {
      const response = await fetchFn("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.slice(0, 500),
          max_results: Math.max(1, Math.min(5, Math.trunc(maxResults))),
          search_depth: "basic",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return [];
      return parseTavilySearchResponse(await response.json());
    } catch {
      return [];
    }
  };
}

export async function getWebSearch(): Promise<WebSearchFn | null> {
  const config = await getWebSearchConfig();
  return config.provider === "tavily" && config.apiKey
    ? createTavilySearch(config.apiKey)
    : null;
}

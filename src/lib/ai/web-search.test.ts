import assert from "node:assert/strict";
import test from "node:test";

import { createTavilySearch, parseTavilySearchResponse } from "./web-search";

test("parses and truncates Tavily search results", () => {
  const parsed = parseTavilySearchResponse({
    results: [{ title: "岗位", url: "https://example.com/job", content: "x".repeat(1_200) }],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.snippet.length, 1_000);
});

test("returns no results for malformed or failed Tavily responses", async () => {
  assert.deepEqual(parseTavilySearchResponse({ results: [{ nope: true }] }), []);
  const search = createTavilySearch("key", async () => {
    throw new Error("offline");
  });
  assert.deepEqual(await search("前端工程师", 3), []);
});

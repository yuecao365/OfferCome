import assert from "node:assert/strict";
import test from "node:test";

import { FormData as UndiciFormData } from "undici";

import {
  resolveAiProxyConfig,
  toUndiciCompatibleBody,
} from "./proxy-fetch";

test("uses one AI proxy for both HTTP and HTTPS requests", () => {
  assert.deepEqual(
    resolveAiProxyConfig({
      AI_HTTP_PROXY: " http://127.0.0.1:7897 ",
      AI_NO_PROXY: " localhost,127.0.0.1 ",
    }),
    {
      httpProxy: "http://127.0.0.1:7897",
      httpsProxy: "http://127.0.0.1:7897",
      noProxy: "localhost,127.0.0.1",
    },
  );
});

test("supports standard proxy environment variables", () => {
  assert.deepEqual(
    resolveAiProxyConfig({
      HTTP_PROXY: "http://proxy.internal:8080",
      HTTPS_PROXY: "http://secure-proxy.internal:8080",
      NO_PROXY: "localhost",
    }),
    {
      httpProxy: "http://proxy.internal:8080",
      httpsProxy: "http://secure-proxy.internal:8080",
      noProxy: "localhost",
    },
  );
});

test("does not replace the default fetch without proxy configuration", () => {
  assert.equal(resolveAiProxyConfig({}), null);
});

test("keeps multipart model and audio fields when using the undici proxy fetch", () => {
  const nativeFormData = new FormData();
  nativeFormData.append("model", "gpt-4o-mini-transcribe");
  nativeFormData.append(
    "file",
    new File([new Uint8Array([1, 2, 3])], "answer.webm", {
      type: "audio/webm",
    }),
  );

  const converted = toUndiciCompatibleBody(nativeFormData);
  assert.ok(converted instanceof UndiciFormData);
  assert.equal(converted.get("model"), "gpt-4o-mini-transcribe");

  const file = converted.get("file");
  assert.ok(typeof file !== "string" && file !== null);
  assert.equal(file.name, "answer.webm");
  assert.equal(file.type, "audio/webm");
  assert.equal(file.size, 3);
});

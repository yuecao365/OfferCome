import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCookieHeaderFromStorageState,
  findStorageStateCookieValue,
} from "./storage-state";

test("builds a cookie header for zhipin cookies only", () => {
  const header = buildCookieHeaderFromStorageState(
    {
      cookies: [
        {
          name: "bst",
          value: "token-value",
          domain: ".zhipin.com",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
        {
          name: "unrelated",
          value: "skip",
          domain: "example.com",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    "https://www.zhipin.com/web/geek/recommend",
  );

  assert.equal(header, "bst=token-value");
});

test("finds a named cookie value in storage state", () => {
  const value = findStorageStateCookieValue(
    {
      cookies: [
        {
          name: "bst",
          value: "token-value",
          domain: ".zhipin.com",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    "bst",
  );

  assert.equal(value, "token-value");
});

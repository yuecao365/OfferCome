import assert from "node:assert/strict";
import test from "node:test";

import {
  BOSS_SOURCE,
  normalizeBossContacts,
  toBossSourceKey,
} from "./parse";

test("normalizes valid contacts and skips rows with missing company or job", () => {
  const contacts = normalizeBossContacts([
    {
      companyName: "  Example Co  ",
      jobTitle: "  Frontend Engineer ",
      href: "https://www.zhipin.com/job_detail/123.html",
    },
    {
      companyName: "",
      jobTitle: "Backend Engineer",
    },
    {
      companyName: "Another Co",
      jobTitle: "   ",
    },
  ]);

  assert.equal(contacts.length, 1);
  assert.deepEqual(contacts[0], {
    companyName: "Example Co",
    jobTitle: "Frontend Engineer",
    source: BOSS_SOURCE,
    sourceKey: "boss_zhipin:url:https://www.zhipin.com/job_detail/123.html",
    jobUrl: "https://www.zhipin.com/job_detail/123.html",
    sourceActivityAt: null,
    sourceStatusCode: null,
  });
});

test("prefers the stable Boss job id over volatile links", () => {
  assert.equal(
    toBossSourceKey({
      companyName: "Example Co",
      jobTitle: "Frontend Engineer",
      href: "https://www.zhipin.com/job_detail/old.html?lid=volatile",
      sourceId: "stable-job-id",
    }),
    "boss_zhipin:job:stable-job-id",
  );
});

test("uses a stable hash source key when no stable link is available", () => {
  const first = toBossSourceKey({
    companyName: " Example Co ",
    jobTitle: " Frontend Engineer ",
  });
  const second = toBossSourceKey({
    companyName: "Example Co",
    jobTitle: "Frontend Engineer",
  });

  assert.equal(first, second);
  assert.match(first, /^boss_zhipin:hash:[a-f0-9]{64}$/);
});

test("deduplicates normalized contacts by source key", () => {
  const contacts = normalizeBossContacts([
    {
      companyName: "Example Co",
      jobTitle: "Frontend Engineer",
    },
    {
      companyName: " Example Co ",
      jobTitle: " Frontend Engineer ",
    },
  ]);

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0]?.companyName, "Example Co");
});

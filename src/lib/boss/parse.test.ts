import assert from "node:assert/strict";
import test from "node:test";

import {
  BOSS_SOURCE,
  isBossJobClosed,
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

test("only treats the observed closed status as taken down", () => {
  // 2 = 已下架（据真实数据推断），其余一律按"不确定"处理，宁可不给建议也不猜。
  assert.equal(isBossJobClosed(2), true);
  assert.equal(isBossJobClosed(1), false);
  assert.equal(isBossJobClosed(0), false);
  assert.equal(isBossJobClosed(99), false);
  assert.equal(isBossJobClosed(null), false);
  assert.equal(isBossJobClosed(undefined), false);
});

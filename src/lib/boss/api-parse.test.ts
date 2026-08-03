import assert from "node:assert/strict";
import test from "node:test";

import { extractBossContactCandidatesFromApiPayload } from "./api-parse";

test("extracts company and job from Boss recommendation card payloads", () => {
  const candidates = extractBossContactCandidatesFromApiPayload({
    code: 0,
    zpData: {
      cardList: [
        {
          brandName: "Example Co",
          jobName: "Frontend Engineer",
          securityId: "security-1",
          encryptJobId: "job-1",
          lid: "lid-1",
        },
      ],
    },
  });

  assert.deepEqual(candidates, [
    {
      companyName: "Example Co",
      jobTitle: "Frontend Engineer",
      href: "https://www.zhipin.com/job_detail/job-1.html",
      sourceId: "job-1",
      sourceActivityAt: null,
      sourceStatusCode: null,
    },
  ]);
});

test("recursively extracts only objects with both company and job fields", () => {
  const candidates = extractBossContactCandidatesFromApiPayload({
    zpData: {
      nested: {
        items: [
          { brandName: "Missing Job" },
          { jobName: "Missing Company" },
          {
            companyName: "Nested Co",
            positionName: "Backend Engineer",
            jobId: 123,
            happenTime: 1_783_330_541_000,
            jobValidStatus: 2,
          },
        ],
      },
    },
  });

  assert.deepEqual(candidates, [
    {
      companyName: "Nested Co",
      jobTitle: "Backend Engineer",
      href: null,
      sourceId: null,
      sourceActivityAt: new Date(1_783_330_541_000),
      sourceStatusCode: 2,
    },
  ]);
});

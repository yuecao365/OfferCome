import assert from "node:assert/strict";
import test, { after, before, mock } from "node:test";

import { createTestDatabase } from "@/lib/test-support/prisma-test-db";

/**
 * 出题前自动识别并落库的回归测试。用真库：关联表、自动标记与并发
 * 幂等是这里最容易改坏的部分。识别 agent 换成桩。
 */

const database = createTestDatabase();
process.env.DATABASE_URL = database.url;

const stub = {
  experiences: [] as Array<{ title: string; type: "internship" | "project" }>,
  calls: 0,
};

mock.module("server-only", { namedExports: {} });
mock.module("./experience-agent", {
  namedExports: {
    extractResumeExperiences: async () => {
      stub.calls += 1;
      return {
        source: "model",
        experiences: stub.experiences.map((item, index) => ({
          title: item.title,
          type: item.type,
          organization: null,
          description: `${item.title} 的描述`,
          startDate: null,
          endDate: null,
          sourceText: item.title,
          sortOrder: index,
        })),
      };
    },
  },
});

let store: typeof import("./experience-store");
let prisma: typeof import("@/lib/db").prisma;
let resumeId: string;
let orphanId: string;

before(async () => {
  store = await import("./experience-store");
  ({ prisma } = await import("@/lib/db"));
  const resume = await prisma.resume.create({
    data: {
      originalName: "简历.pdf",
      storedName: "resume-1.pdf",
      filePath: "/tmp/resume-1.pdf",
      mimeType: "application/pdf",
      fileSize: 1,
    },
  });
  resumeId = resume.id;
  // 一条来自已删除简历版本的孤儿项目：resumeId 为空、没有任何关联。
  const orphan = await prisma.resumeProject.create({
    data: { name: "Study Assistant - Local Personal Assistant", type: "project" },
  });
  orphanId = orphan.id;
});

after(async () => {
  await prisma.$disconnect();
  database.cleanup();
});

test("links recognised experiences to existing projects and creates the rest as unconfirmed", async () => {
  stub.experiences = [
    { title: "Study Assistant - Local Personal Assistant", type: "project" },
    { title: "Persona-Driven LLM Agents", type: "project" },
  ];

  const result = await store.ensureResumeExperiences({ resumeId, resumeText: "…" });
  assert.deepEqual(result, { createdCount: 1, linkedCount: 1 });

  const sources = await prisma.resumeProjectSource.findMany({
    where: { resumeId },
    include: { resumeProject: true },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(sources.length, 2);
  const linked = sources.find((item) => item.resumeProjectId === orphanId);
  assert.ok(linked, "孤儿项目按名字挂回了这份简历，而不是重复创建");
  const created = sources.find((item) => item.resumeProjectId !== orphanId)!;
  assert.equal(created.resumeProject.name, "Persona-Driven LLM Agents");
  assert.equal(created.resumeProject.resumeId, resumeId);
  assert.ok(created.resumeProject.autoExtractedAt, "新建条目带自动识别标记");
  assert.equal(
    (await prisma.resumeProject.findUniqueOrThrow({ where: { id: orphanId } })).autoExtractedAt,
    null,
    "已有条目不打标记",
  );
});

test("does nothing once the resume already has links", async () => {
  const callsBefore = stub.calls;
  const result = await store.ensureResumeExperiences({ resumeId, resumeText: "…" });
  assert.deepEqual(result, { createdCount: 0, linkedCount: 0 });
  assert.equal(stub.calls, callsBefore, "不再花模型调用");
});

test("weak name matches are not auto-linked without a human in the loop", async () => {
  const other = await prisma.resume.create({
    data: {
      originalName: "简历2.pdf",
      storedName: "resume-2.pdf",
      filePath: "/tmp/resume-2.pdf",
      mimeType: "application/pdf",
      fileSize: 1,
    },
  });
  // 与孤儿项目仅部分词重合：确认面板会推荐挂上，自动路径宁可新建。
  stub.experiences = [{ title: "Personal Assistant Agent", type: "project" }];

  const result = await store.ensureResumeExperiences({
    resumeId: other.id,
    resumeText: "…",
  });
  assert.deepEqual(result, { createdCount: 1, linkedCount: 0 });
});

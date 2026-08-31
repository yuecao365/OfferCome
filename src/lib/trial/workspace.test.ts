import assert from "node:assert/strict";
import test from "node:test";

import type { ApplicationFilters } from "@/lib/applications/types";

import {
  createEmptyWorkspace,
  deleteApplication,
  isTrialWorkspace,
  queryApplications,
  upsertApplication,
  type TrialWorkspace,
} from "./workspace";

/** 体验版工作台的纯操作测试——服务端无状态，这一层就是全部业务正确性。 */

const baseFilters: ApplicationFilters = {
  q: "",
  status: "all",
  source: "all",
  from: "",
  to: "",
  sortBy: "updatedAt",
  sortDir: "desc",
  page: 1,
  pageSize: 12,
};

function seeded(): TrialWorkspace {
  let workspace = createEmptyWorkspace();
  workspace = upsertApplication(workspace, {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    stage: "applied",
    appliedAt: new Date("2026-08-01T10:00:00"),
    source: "boss_zhipin",
    jobUrl: null,
    jobDescription: "",
    note: "内推投递",
  });
  workspace = upsertApplication(workspace, {
    companyName: "星野网络",
    jobTitle: "前端开发工程师",
    stage: "first_interview",
    appliedAt: new Date("2026-08-10T10:00:00"),
    source: "company_site",
    jobUrl: null,
    jobDescription: "",
    note: "",
  });
  return workspace;
}

test("creates, edits and deletes applications through pure operations", () => {
  let workspace = seeded();
  assert.equal(workspace.applications.length, 2);

  const target = workspace.applications.find((item) => item.companyName === "云帆科技")!;
  workspace = upsertApplication(
    workspace,
    {
      companyName: "云帆科技",
      jobTitle: "高级后端开发工程师",
      stage: "second_interview",
      appliedAt: new Date(target.appliedAt),
      source: target.source,
      jobUrl: null,
      jobDescription: "",
      note: target.note,
    },
    target.id,
  );
  // 编辑是原地更新而不是追加。
  assert.equal(workspace.applications.length, 2);
  const edited = workspace.applications.find((item) => item.id === target.id)!;
  assert.equal(edited.jobTitle, "高级后端开发工程师");
  assert.equal(edited.createdAt, target.createdAt);

  workspace = deleteApplication(workspace, target.id);
  assert.equal(workspace.applications.length, 1);
});


test("filters by keyword, stage, source and date range like the local version", () => {
  const workspace = seeded();

  assert.equal(queryApplications(workspace, { ...baseFilters, q: "云帆" }).total, 1);
  assert.equal(
    queryApplications(workspace, { ...baseFilters, status: "first_interview" }).total,
    1,
  );
  assert.equal(
    queryApplications(workspace, { ...baseFilters, source: "company_site" }).total,
    1,
  );
  assert.equal(
    queryApplications(workspace, { ...baseFilters, from: "2026-08-05", to: "2026-08-15" })
      .items[0]!.companyName,
    "星野网络",
  );
  assert.equal(queryApplications(workspace, { ...baseFilters, q: "不存在" }).total, 0);
});

test("sorts and paginates with the same shape the page expects", () => {
  let workspace = createEmptyWorkspace();
  for (let index = 0; index < 15; index += 1) {
    workspace = upsertApplication(workspace, {
      companyName: `公司${index}`,
      jobTitle: "工程师",
      stage: "applied",
      appliedAt: new Date(2026, 7, index + 1),
      source: "manual",
      jobUrl: null,
      jobDescription: "",
      note: "",
    });
  }

  const ascending = queryApplications(workspace, {
    ...baseFilters,
    sortBy: "appliedAt",
    sortDir: "asc",
  });
  assert.equal(ascending.items[0]!.companyName, "公司0");
  assert.equal(ascending.total, 15);
  assert.equal(ascending.totalPages, 2);
  assert.equal(ascending.items.length, 12);

  const secondPage = queryApplications(workspace, {
    ...baseFilters,
    sortBy: "appliedAt",
    sortDir: "asc",
    page: 2,
  });
  assert.equal(secondPage.items.length, 3);
  // 页码越界收敛到最后一页，而不是空列表。
  assert.equal(
    queryApplications(workspace, { ...baseFilters, page: 99 }).page,
    2,
  );
});

test("rejects stored documents from other versions", () => {
  assert.equal(isTrialWorkspace(createEmptyWorkspace()), true);
  assert.equal(isTrialWorkspace({ version: 0, applications: [] }), false);
  assert.equal(isTrialWorkspace(null), false);
});

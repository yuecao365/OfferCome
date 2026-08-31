import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyWorkspace, setWorkspaceResume, type TrialWorkspace } from "./workspace";
import { upsertInterview } from "./workspace-interviews";
import {
  deleteTrialResumeProject,
  saveTrialResumeProject,
  trialResumeListItems,
  trialResumeProjectOptions,
  trialResumeProjects,
} from "./workspace-resume";
import { reclassifyTrialQuestions, trialReviewPageData } from "./workspace-review";

/** 体验版简历中心与项目关联的纯操作测试。 */

function withResume(): TrialWorkspace {
  return setWorkspaceResume(
    createEmptyWorkspace(),
    {
      text: "三年后端开发经验",
      projects: [
        {
          id: "project-1",
          name: "订单系统",
          type: "project",
          organization: "云帆科技",
          description: "高并发订单链路",
        },
      ],
    },
    { fileName: "resume.pdf", fileSize: 1024, mimeType: "application/pdf" },
  );
}

test("setWorkspaceResume 记录来源信息，清空时一并清除", () => {
  const workspace = withResume();
  assert.equal(workspace.resumeMeta?.fileName, "resume.pdf");

  const cleared = setWorkspaceResume(workspace, null);
  assert.equal(cleared.resume, null);
  assert.equal(cleared.resumeMeta, null);
});

test("trialResumeListItems 输出与本地版列表相同形状的单条记录", () => {
  const items = trialResumeListItems(withResume());
  assert.equal(items.length, 1);
  assert.equal(items[0].originalName, "resume.pdf");
  assert.equal(items[0].isDefault, true);
  assert.equal(trialResumeListItems(createEmptyWorkspace()).length, 0);
});

test("saveTrialResumeProject 新增与更新条目", () => {
  let workspace = saveTrialResumeProject(withResume(), {
    id: null,
    name: "推荐系统",
    type: "internship",
    organization: "深澜智能",
    description: "召回与重排",
  });
  assert.equal(workspace.resume?.projects.length, 2);

  const added = workspace.resume!.projects[1];
  workspace = saveTrialResumeProject(workspace, {
    id: added.id,
    name: "推荐系统 v2",
    type: "internship",
    organization: null,
    description: null,
  });
  assert.equal(workspace.resume?.projects[1].name, "推荐系统 v2");
  assert.equal(trialResumeProjects(workspace).length, 2);
  assert.equal(trialResumeProjectOptions(workspace)[0].name, "订单系统");
});

test("deleteTrialResumeProject 同时解开题目关联", () => {
  let workspace = upsertInterview(withResume(), {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    interviewedAt: new Date("2026-08-01T14:00:00"),
    round: "first_interview",
    note: "",
    questions: [
      {
        question: "介绍订单系统",
        answer: "……",
        category: "resume_project",
        resumeProjectId: "project-1",
        sortOrder: 0,
      },
    ],
  });
  assert.equal(workspace.interviews[0].questions[0].resumeProjectId, "project-1");

  workspace = deleteTrialResumeProject(workspace, "project-1");
  assert.equal(workspace.resume?.projects.length, 0);
  assert.equal(workspace.interviews[0].questions[0].resumeProjectId, null);
});

test("复盘按项目聚焦，并支持归类到具体项目", () => {
  const workspace = upsertInterview(withResume(), {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    interviewedAt: new Date("2026-08-01T14:00:00"),
    round: "first_interview",
    note: "",
    questions: [
      {
        question: "介绍订单系统",
        answer: "……",
        category: "resume_project",
        resumeProjectId: "project-1",
        sortOrder: 0,
      },
      {
        question: "讲讲缓存一致性",
        answer: "……",
        category: "technical",
        resumeProjectId: null,
        sortOrder: 1,
      },
    ],
  });

  const data = trialReviewPageData(workspace, {
    section: "projects",
    projectId: "project-1",
    category: null,
    source: "all",
    page: 1,
  });
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].questionCount, 1);
  assert.equal(data.selectedProject?.name, "订单系统");
  assert.equal(data.questionsPage.total, 1);

  // 把技术题归类到该项目
  const technicalId = workspace.interviews[0].questions[1].id;
  const result = reclassifyTrialQuestions(workspace, {
    questionIds: [technicalId],
    category: "resume_project",
    resumeProjectId: "project-1",
  });
  assert.equal(result.count, 1);
  assert.equal(
    result.workspace.interviews[0].questions[1].resumeProjectId,
    "project-1",
  );

  // 目标项目不存在时报错且不落盘
  const missing = reclassifyTrialQuestions(workspace, {
    questionIds: [technicalId],
    category: "resume_project",
    resumeProjectId: "ghost",
  });
  assert.equal(missing.missingProject, true);
  assert.equal(missing.count, 0);
});

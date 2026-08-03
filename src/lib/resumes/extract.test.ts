import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  extractResumeExperiencesFromText,
  extractResumeTextFromFile,
  normalizeResumeExperienceType,
} from "./extract";
import { RESUME_UPLOAD_DIR } from "./storage";

test("extracts internships and projects from resume section text", () => {
  const text = `
教育经历
某大学 本科

实习经历
字节跳动 前端开发实习生 2025.06-2025.09
- 负责营销活动页面开发
- 接入埋点并优化首屏性能

腾讯 后端开发实习生 2024.07-2024.10
参与订单服务接口维护

个人项目
Career Agent 求职管理工具 2026.01-2026.03
- 使用 Next.js 和 Prisma 构建本地求职管理工具

校园论坛
基于 React 实现帖子列表和评论

技能
TypeScript React Node.js
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 4);
  assert.deepEqual(
    experiences.map((item) => item.type),
    ["internship", "internship", "project", "project"],
  );
  assert.equal(experiences[0].title, "前端开发实习生");
  assert.equal(experiences[0].organization, "字节跳动");
  assert.match(experiences[0].description ?? "", /营销活动页面/);
  assert.equal(experiences[2].title, "Career Agent 求职管理工具");
  assert.equal(experiences[2].organization, null);
});

test("does not extract resume projects from raw PDF object text", () => {
  const text = `%PDF-1.5 % 2 0 obj << /Linearized 1 /L 1720322 /H [ 1146 201 ] /O 6 /E 1720322 /N 1 /T 1720321 >> endobj
3 0 obj << /Type /XRef /Length 119 /Filter /FlateDecode /DecodeParms << /Columns 4 /Predictor 12 >> >> stream
xref trailer startxref`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 0);
});

test("returns no extracted text for uploaded resume images", async () => {
  await fs.mkdir(RESUME_UPLOAD_DIR, { recursive: true });
  const imagePath = path.join(RESUME_UPLOAD_DIR, `resume-image-${Date.now()}.png`);
  await fs.writeFile(
    imagePath,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  try {
    const text = await extractResumeTextFromFile(imagePath, "image/png");
    assert.equal(text, "");
  } finally {
    await fs.unlink(imagePath).catch(() => undefined);
  }
});

test("recognizes multiple local assistant and LLM simulation projects without section headings", () => {
  const text = `
Study Assistant LLM Agent 2026 4 -
Built a localized personal assistant system with Agent Harness, memory, tool calling, prompt tracing, and observation loops.
The system connects LLM reasoning with local workflows.

LLM 2025 9 - 2026 1
Built a multi-agent social simulation and evaluation system with LangGraph, Agentic Workflow, AgentState, Memory, Observation, Action, Environment, Tool Calling, and JSON actions.
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 2);
  assert.deepEqual(
    experiences.map((item) => item.title),
    [
      "Study Assistant ——基于 LLM Agent 的本地化个人助手系统",
      "LLM 多智能体社交仿真与评估系统",
    ],
  );
});

test("normalizes unknown resume experience types to project", () => {
  assert.equal(normalizeResumeExperienceType("internship"), "internship");
  assert.equal(normalizeResumeExperienceType("project"), "project");
  assert.equal(normalizeResumeExperienceType("other"), "project");
});

test("extracts English experience and project sections", () => {
  const text = `
Education
University of California, Santa Barbara

Experience
OpenAI Software Engineer Intern 2025.06-2025.09
- Built internal workflow tools.

Projects
Career Agent 2026.01-2026.03
- Built a local job tracking dashboard.
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 2);
  assert.equal(experiences[0].type, "internship");
  assert.equal(experiences[0].organization, "OpenAI");
  assert.equal(experiences[0].title, "Software Engineer Intern");
  assert.equal(experiences[1].type, "project");
  assert.equal(experiences[1].title, "Career Agent");
});

test("extracts only project headings from English project sections", () => {
  const text = `
PROJECTS
Study Assistant - Local Personal Assistant Based on LLM Agents Apr. 2026 - Present
Built a local assistant with LLM agent workflows, memory, tools, and proactive study guidance.
Generated personalized review plans and proactive study guidance.

Persona-Driven LLM Agents for Social Media Community Engagement Sep. 2025 - Jun. 2026
Built persona-driven agents for community engagement simulation and evaluation.
Improved realistic interaction patterns than direct message passing.

S KILLS
Python, TypeScript, Next.js, DPO, and GRPO.
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 2);
  assert.deepEqual(
    experiences.map((item) => item.title),
    [
      "Study Assistant - Local Personal Assistant Based on LLM Agents",
      "Persona-Driven LLM Agents for Social Media Community Engagement",
    ],
  );
});
test("falls back to date-based project extraction without section headings", () => {
  const text = `
Career Agent 2026.01-2026.03
Built a local job tracking dashboard with Next.js and Prisma.

LLM Agent Harness 2025.09-2026.01
Designed an agent runtime for prompt and tool orchestration.
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 2);
  assert.deepEqual(
    experiences.map((item) => item.type),
    ["project", "project"],
  );
  assert.equal(experiences[0].title, "Career Agent");
  assert.equal(experiences[1].title, "LLM Agent Harness");
});

test("recognizes project headings with incomplete PDF date ranges", () => {
  const text = `
Study Assistant LLM Agent 2026 4 –
Built an agent workflow with memory and prompt tracing.

LLM 2025 9 – 2026 1
Agentic Workflow with LangGraph.
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 2);
  assert.equal(
    experiences[0].title,
    "Study Assistant ——基于 LLM Agent 的本地化个人助手系统",
  );
  assert.equal(experiences[1].title, "LLM 多智能体社交仿真与评估系统");
});

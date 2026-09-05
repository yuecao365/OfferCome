import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { extractResumeExperiencesFromText, extractResumeTextFromFile } from "./extract";
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

  assert.equal(extractResumeExperiencesFromText(text).length, 0);
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

test("keeps project titles verbatim apart from whitespace and dash cleanup", () => {
  const text = `
PROJECTS
Study Assistant – Local  Personal Assistant Apr. 2026 - Present
Built a local assistant with LLM agent workflows.

S KILLS
Python, TypeScript.
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.deepEqual(
    experiences.map((item) => item.title),
    ["Study Assistant - Local Personal Assistant"],
  );
});

test("recognizes headings that share a line with content or a bilingual label", () => {
  const text = `
■ 实习经历 Internship Experience
华泰证券 汽车行业研究实习生 2025.06-2025.09
撰写行业周报与公司深度报告。

项目经历：OfferCome 求职助手 2026.01-至今
基于 Next.js 的本地求职管理工具。

教育背景：武汉大学 硕士 2028 年毕业
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.deepEqual(
    experiences.map((item) => [item.type, item.title, item.organization]),
    [
      ["internship", "汽车行业研究实习生", "华泰证券"],
      ["project", "OfferCome 求职助手", null],
    ],
  );
});

test("does not treat dated education or award lines as projects without a section heading", () => {
  const text = `
武汉大学经济管理学院硕士：国际商务 2026.09-2028.06
主修课程：海关实务（97）、概率论（93）

荣誉奖项 2025.10 校级一等奖学金
`;

  assert.equal(extractResumeExperiencesFromText(text).length, 0);
});

test("stops an internship section when a heading-like keyword starts a longer word", () => {
  const text = `
实习经历
美团 项目经理实习生 2025.03-2025.06
项目经理实习生负责需求评审与排期。
`;

  const experiences = extractResumeExperiencesFromText(text);

  assert.equal(experiences.length, 1);
  assert.equal(experiences[0].type, "internship");
  assert.equal(experiences[0].title, "项目经理实习生");
});

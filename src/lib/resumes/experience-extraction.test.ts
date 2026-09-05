import assert from "node:assert/strict";
import test from "node:test";

import {
  resumeExperienceOutputSchema,
  validateExtractedResumeExperiences,
} from "./experience-extraction";

const RESUME = `
实习经历
华泰证券 汽车行业研究实习生 2025.06 - 2025.09
撰写行业周报与公司深度报告。

项目经历
OfferCome 求职助手 2026.01 至今
基于 Next.js 的本地求职管理工具。

教育背景
武汉大学 硕士 国际商务 2026-2028
`;

test("keeps experiences whose source text or title appears in the resume", () => {
  const experiences = validateExtractedResumeExperiences(RESUME, {
    experiences: [
      {
        type: "internship",
        title: "汽车行业研究实习生",
        organization: "华泰证券",
        description: "撰写行业周报与公司深度报告",
        startDate: "2025年06月",
        endDate: "2025.09",
        sourceText: "华泰证券 汽车行业研究实习生 2025.06 - 2025.09",
      },
      {
        type: "project",
        title: "OfferCome 求职助手",
        organization: null,
        description: null,
        startDate: "2026.01",
        endDate: "至今",
        // 模型意译了原文：sourceText 对不上，但标题本身在简历里。
        sourceText: "一个用 Next.js 写的求职工具",
      },
      {
        type: "project",
        title: "编造的区块链项目",
        organization: null,
        description: null,
        startDate: null,
        endDate: null,
        sourceText: "简历里并没有这句话",
      },
      {
        type: "internship",
        title: "汽车行业研究实习生",
        organization: "华泰证券",
        description: "重复条目",
        startDate: null,
        endDate: null,
        sourceText: "华泰证券 汽车行业研究实习生",
      },
    ],
  });

  assert.deepEqual(
    experiences.map((item) => [item.type, item.title, item.sourceText, item.sortOrder]),
    [
      [
        "internship",
        "汽车行业研究实习生",
        "华泰证券 汽车行业研究实习生 2025.06 - 2025.09",
        0,
      ],
      ["project", "OfferCome 求职助手", "OfferCome 求职助手", 1],
    ],
  );
  assert.equal(experiences[0].startDate, "2025.06");
  assert.equal(experiences[0].endDate, "2025.09");
  assert.equal(experiences[1].endDate, "至今");
});

test("output schema is compatible with strict structured output", () => {
  const parsed = resumeExperienceOutputSchema.safeParse({
    experiences: [
      {
        type: "project",
        title: "x",
        organization: null,
        description: null,
        startDate: null,
        endDate: null,
        sourceText: "x",
      },
    ],
  });
  assert.equal(parsed.success, true);
  assert.equal(
    resumeExperienceOutputSchema.safeParse({ experiences: [{ type: "other", title: "x" }] })
      .success,
    false,
  );
});

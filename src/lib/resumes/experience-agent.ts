import "server-only";

import { runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

import type { ResumeExperienceExtractionSource } from "./confirmation";
import {
  extractResumeExperiencesFromText,
  type ExtractedResumeExperience,
} from "./extract";
import {
  RESUME_EXTRACTION_PROMPT_VERSION,
  resumeExperienceOutputSchema,
  validateExtractedResumeExperiences,
} from "./experience-extraction";

/**
 * 从简历文本里识别实习/项目：配置了模型就交给模型做结构化抽取，
 * 没配置或模型失败时退回章节规则。两条路径产出同一种条目，
 * 下游的确认面板与项目库不感知来源。
 */

const MAX_INPUT_CHARS = 30_000;
const TIMEOUT_MS = 60_000;

export type ResumeExperienceExtraction = {
  experiences: ExtractedResumeExperience[];
  source: ResumeExperienceExtractionSource;
};

const rescueExperiences = salvageJson(resumeExperienceOutputSchema);

export async function extractResumeExperiences(
  resumeText: string,
): Promise<ResumeExperienceExtraction> {
  const text = resumeText.trim();
  if (!text) return { experiences: [], source: "rules" };

  const config = await getAiTaskConfig("text");
  if (!isAiTaskConfigured(config)) {
    return { experiences: extractResumeExperiencesFromText(text), source: "rules" };
  }

  try {
    const { output } = await runAgent({
      agent: "resume_experience_extraction",
      config,
      feature: "简历解析",
      promptVersion: RESUME_EXTRACTION_PROMPT_VERSION,
      schema: resumeExperienceOutputSchema,
      schemaName: "resume_experiences",
      schemaDescription: "简历中的实习经历与项目经历列表",
      timeoutMs: TIMEOUT_MS,
      maxOutputTokens: 6_000,
      rescue: rescueExperiences,
      untrustedInputs: "简历文本",
      system: `你是简历结构化助手。从简历文本中找出候选人的每一段实习经历和项目经历，逐条输出。

判定标准：
- internship：在公司、机构或实验室的实习、兼职、全职工作经历，必须有雇主组织，organization 填雇主名，title 填岗位或职位。
- project：课程项目、个人项目、竞赛项目、科研项目，title 填项目名，organization 填所属学校/团队/公司（没有则为 null）。
- 以下内容不是实习或项目，一律不要输出：教育经历与学位、主修课程与成绩、荣誉奖项与奖学金、证书与语言成绩、技能清单、自我评价、社团职务本身（社团里做过的具体项目可以算 project）。

字段要求：
- sourceText 必须从简历原文中连续逐字复制该条经历的标题行（可附上紧随其后的一两句原文），不得改写、翻译或概括。
- description 用简历原文概括该经历做了什么（职责、技术、结果），不要编造原文没有的信息。
- startDate / endDate 使用原文里的时间，格式如 2025.06、2025、至今；原文没有则为 null。
- 按简历中出现的顺序输出，不要合并不同的经历，也不要拆分同一段经历。简历中没有任何实习或项目时返回空数组。

提示词版本：${RESUME_EXTRACTION_PROMPT_VERSION}`,
      payload: { resumeText: text.slice(0, MAX_INPUT_CHARS) },
    });

    const experiences = validateExtractedResumeExperiences(text, output);
    if (experiences.length > 0) return { experiences, source: "model" };
    // 模型说没有：可能真没有，也可能是没找到依据。规则能补上就用规则的，
    // 补不上就尊重模型的判断，不必再提示"连接模型"。
    const byRules = extractResumeExperiencesFromText(text);
    return byRules.length > 0
      ? { experiences: byRules, source: "rules" }
      : { experiences: [], source: "model" };
  } catch (error) {
    // 模型失败不拦路：规则结果可编辑，总比让用户对着"请重试"强。
    console.warn(
      "[resumes] model extraction failed; using rules:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  return { experiences: extractResumeExperiencesFromText(text), source: "rules" };
}

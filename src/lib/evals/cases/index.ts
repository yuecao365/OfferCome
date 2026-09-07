import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

/**
 * 冻结的评测数据集。
 *
 * JD 来自大厂公开招聘页，逐字保存，每条只写期望性质不写期望文本；
 * 简历用合成简历（进仓库）或用户本地简历（`user`，不进仓库）。
 * 用例 = JD × 简历 的笛卡尔积，边界与对抗组可以限定只配某份简历。
 */

export const JD_DIRECTIONS = [
  "backend",
  "frontend",
  "algorithm",
  "agent",
  "data",
  "test",
  "infra",
  "edge",
] as const;
export type JdDirection = (typeof JD_DIRECTIONS)[number];

export const RESUME_FIXTURES = ["user", "synthetic-backend"] as const;
export type ResumeFixture = (typeof RESUME_FIXTURES)[number];

const expectOverrideSchema = z
  .object({
    maxBlueprintLevel: z.number().int().min(1).max(3),
    minCompetencies: z.number().int().min(0),
    maxFabricated: z.number().int().min(0),
    minAccepted: z.number().int().min(0).nullable(),
    maxGeneral: z.number().int().min(0),
    maxResume: z.number().int().min(0).nullable(),
    requiredSkills: z.array(z.string()),
    minVerbatimEvidenceRate: z.number().min(0).max(1),
    maxHistorySimilarity: z.number().min(0).max(1),
    canary: z.string().nullable(),
  })
  .partial();

/** 用例可覆盖的判分阈值；出题评测重写为简报评测时在此扩展。 */
export type CaseExpect = z.infer<typeof expectOverrideSchema>;

export const jdFixtureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  company: z.string().min(1),
  title: z.string().min(1),
  direction: z.enum(JD_DIRECTIONS),
  /** 招聘页地址；合成用例写 synthetic。 */
  source: z.string().min(1),
  postedAt: z.string().min(1),
  status: z.enum(["active", "closed", "synthetic"]),
  jobDescription: z.string().min(20),
  /** 覆盖默认判分阈值；边界与对抗组用。 */
  expect: expectOverrideSchema.optional(),
  /** 限定只与哪些简历组合；缺省全部。 */
  resumes: z.array(z.enum(RESUME_FIXTURES)).min(1).optional(),
});

export type JdFixture = z.infer<typeof jdFixtureSchema>;

export const CASES_DIR = path.join(process.cwd(), "src", "lib", "evals", "cases");

export function loadJdFixtures(dir = path.join(CASES_DIR, "jd")): JdFixture[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const fixture = jdFixtureSchema.parse(
        JSON.parse(readFileSync(path.join(dir, name), "utf8")),
      );
      if (`${fixture.id}.json` !== name) {
        throw new Error(`JD fixture ${name} 的 id 与文件名不一致：${fixture.id}`);
      }
      return fixture;
    });
}

export function loadSyntheticResumeText(
  fixture: Exclude<ResumeFixture, "user">,
  dir = path.join(CASES_DIR, "resumes"),
): string {
  return readFileSync(path.join(dir, `${fixture}.md`), "utf8");
}

export type GenerationCase = {
  id: string;
  jd: JdFixture;
  resume: ResumeFixture;
  questionCount: number;
  expect: CaseExpect;
};

export function buildGenerationCases(
  fixtures: JdFixture[],
  resumes: readonly ResumeFixture[] = RESUME_FIXTURES,
  questionCount = 8,
): GenerationCase[] {
  return fixtures.flatMap((jd) =>
    (jd.resumes ?? resumes).map((resume) => ({
      id: `${jd.id}__${resume}`,
      jd,
      resume,
      questionCount,
      expect: jd.expect ?? {},
    })),
  );
}

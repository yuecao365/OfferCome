import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { LADDER_STYLES, type InterviewBrief, type LadderStyle } from "@/lib/mock-interviews/interviewer/brief";

import { EVAL_DIR } from "./fixtures";
import { ratio, type MetricRow, type MetricValue, type Ratio } from "./report";

/**
 * 备课的话题覆盖率：面经抽出的岗位话题表 vs 简报的领域与阶梯。
 * 只验"贴岗位"：项目类领域不参与（面经里没有别人简历的对照）。
 */

export const COVERAGE_ROLES = ["ai-llm", "frontend", "backend", "test-qa", "infra"] as const;
export type CoverageRole = (typeof COVERAGE_ROLES)[number];

export const topicSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(200),
  /** 提到这个话题的面经篇数；覆盖率按它加权。 */
  count: z.number().int().min(1),
  /** 来自面经的原题，做裁判校准的正样本。 */
  examples: z.array(z.string().min(1)).min(1).max(5),
});
export type Topic = z.infer<typeof topicSchema>;

export const topicsFileSchema = z.object({
  generatedAt: z.string(),
  aux: z.string(),
  roles: z.partialRecord(z.enum(COVERAGE_ROLES), z.object({ files: z.number().int().min(1), topics: z.array(topicSchema).min(1) })),
});
export type TopicsFile = z.infer<typeof topicsFileSchema>;

/** 每个岗位用哪几份 JD 生成简报（eval/coverage.json）。 */
export const coverageConfigSchema = z.object({
  resume: z.string().min(1),
  roles: z.partialRecord(z.enum(COVERAGE_ROLES), z.array(z.string().min(1)).min(1)),
});
export type CoverageConfig = z.infer<typeof coverageConfigSchema>;

export const TOPICS_FILE = path.join(EVAL_DIR, "mianjing", "topics.json");
export const COVERAGE_CONFIG_FILE = path.join(EVAL_DIR, "coverage.json");

export function loadTopics(file = TOPICS_FILE): TopicsFile {
  return topicsFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function loadCoverageConfig(file = COVERAGE_CONFIG_FILE): CoverageConfig {
  return coverageConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** 简报里参与覆盖的内容：非项目领域的名称、描述与阶梯，拼成裁判可读的一段。 */
export function briefCoverageText(brief: InterviewBrief): string {
  return brief.areas
    .filter((area) => area.kind !== "project")
    .map((area) => {
      const ladder = area.ladder.map((rung, index) => `${index + 1}. ${rung.text}`).join("；");
      return `【${area.name}】${area.description}。切入问题：${area.entryQuestion}。追问阶梯：${ladder}`;
    })
    .join("\n");
}

const STYLE_ORDER: Record<LadderStyle, number> = Object.fromEntries(LADDER_STYLES.map((style, index) => [style, index])) as Record<LadderStyle, number>;

/** 阶梯是否从事实到原理到场景 / 取舍递进：风格序号单调不减；没标风格的级跳过。 */
export function ladderProgresses(ladder: { style: LadderStyle | null }[]): boolean | null {
  const styles = ladder.flatMap((rung) => (rung.style ? [STYLE_ORDER[rung.style]] : []));
  if (styles.length < 2) return null;
  return styles.every((value, index) => index === 0 || value >= styles[index - 1]);
}

export type BriefCoverage = {
  role: CoverageRole;
  jd: string;
  rep: number;
  /** 每个话题是否被覆盖；裁判失败为 null。 */
  covered: Record<string, boolean | null>;
  ladderProgressRate: Ratio;
  areaCount: number;
  baselineAreaCount: number;
  /** 备课加载了哪些技能包；覆盖率低时先看这里。 */
  skillPacks: string[];
};

/** 按面经频次加权的覆盖率，以及不加权的。 */
export function coverageRates(topics: Topic[], covered: Record<string, boolean | null>): { weighted: Ratio; plain: Ratio } {
  const judged = topics.filter((topic) => typeof covered[topic.id] === "boolean");
  return {
    weighted: ratio(judged.filter((topic) => covered[topic.id]).reduce((sum, topic) => sum + topic.count, 0), judged.reduce((sum, topic) => sum + topic.count, 0)),
    plain: ratio(judged.filter((topic) => covered[topic.id]).length, judged.length),
  };
}

export function briefLadderRate(brief: InterviewBrief): Ratio {
  const verdicts = brief.areas.map((area) => ladderProgresses(area.ladder)).filter((value): value is boolean => value !== null);
  return ratio(verdicts.filter(Boolean).length, verdicts.length);
}

export type RoleCoverageMetrics = {
  role: CoverageRole;
  briefs: number;
  weightedCoverage: Ratio;
  plainCoverage: Ratio;
  ladderProgressRate: Ratio;
  baselineAreaShare: Ratio;
  /** 每个岗位最常被漏掉的话题（按频次）。 */
  missed: { id: string; name: string; count: number; missedIn: number }[];
};

function sumRatios(values: Ratio[]): Ratio {
  return ratio(values.reduce((sum, item) => sum + item.numerator, 0), values.reduce((sum, item) => sum + item.denominator, 0));
}

export function summarizeRoleCoverage(role: CoverageRole, topics: Topic[], briefs: BriefCoverage[]): RoleCoverageMetrics {
  const rates = briefs.map((brief) => coverageRates(topics, brief.covered));
  const missed = topics
    .map((topic) => ({ id: topic.id, name: topic.name, count: topic.count, missedIn: briefs.filter((brief) => brief.covered[topic.id] === false).length }))
    .filter((topic) => topic.missedIn > 0)
    .sort((a, b) => b.missedIn - a.missedIn || b.count - a.count)
    .slice(0, 8);
  return {
    role,
    briefs: briefs.length,
    weightedCoverage: sumRatios(rates.map((rate) => rate.weighted)),
    plainCoverage: sumRatios(rates.map((rate) => rate.plain)),
    ladderProgressRate: sumRatios(briefs.map((brief) => brief.ladderProgressRate)),
    baselineAreaShare: ratio(briefs.reduce((sum, brief) => sum + brief.baselineAreaCount, 0), briefs.reduce((sum, brief) => sum + brief.areaCount, 0)),
    missed,
  };
}

export function coverageMetricRows(roles: RoleCoverageMetrics[], judgeTrusted: boolean): MetricRow[] {
  const note = judgeTrusted ? "" : "topic 裁判未通过校准，不计入结论";
  return roles.flatMap((item) => [
    { name: `${item.role} 话题覆盖率（加权）`, value: judgeTrusted ? item.weightedCoverage : null, expect: "记基线", note },
    { name: `${item.role} 话题覆盖率`, value: judgeTrusted ? item.plainCoverage : null, expect: "记基线", note: item.missed.slice(0, 3).map((topic) => topic.name).join("、") },
    { name: `${item.role} 阶梯递进率`, value: item.ladderProgressRate, expect: "记基线", note: "事实 → 原理 → 场景 / 取舍" },
    { name: `${item.role} 基线领域占比`, value: item.baselineAreaShare, expect: "记基线", note: "技能包补的领域 / 全部领域" },
  ]);
}

export function flattenCoverageMetrics(roles: RoleCoverageMetrics[]): Record<string, MetricValue> {
  return Object.fromEntries(
    roles.flatMap((item) => [
      [`${item.role}.weightedCoverage`, item.weightedCoverage],
      [`${item.role}.plainCoverage`, item.plainCoverage],
      [`${item.role}.ladderProgressRate`, item.ladderProgressRate],
      [`${item.role}.baselineAreaShare`, item.baselineAreaShare],
    ]),
  );
}

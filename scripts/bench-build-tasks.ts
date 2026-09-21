import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { runAgent } from "../src/lib/ai/run-agent";
import { salvageJson } from "../src/lib/ai/salvage-json";
import { resolveModel } from "../src/lib/evals/bench/models";
import { BENCH_LEVELS, CANDIDATE_STYLES, MAX_TURNS, type Behavior, type BenchLevel, type CandidateStyle, type Competency, type Fact, type Task } from "../src/lib/evals/bench/types";
import { loadJdFixture, loadResumeText } from "../src/lib/evals/fixtures";

/**
 * 造 InterviewBench 端到端任务（README §3）。一次性、可复现：种子固定，模型产出的能力清单与埋点候选进任务文件，
 * 之后不再重跑（要改就改文件）。用法：
 *   npm run bench:build -- --set dev            # 10 份 JD × 3 候选人
 *   npm run bench:build -- --set heldout        # 另 10 份 JD × 2 候选人
 * 模型来自 eval/bench/env.json 的 taskBuilder。
 */

const BENCH_DIR = path.join(process.cwd(), "eval", "bench");
const env = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "env.json"), "utf8")) as { taskBuilder: { model: string; promptVersion: string } };

/** 五个方向各配同向简历；开发集与留出集 JD 不重叠。 */
const DIRECTIONS: Record<string, { resume: string; dev: string[]; heldout: string[] }> = {
  agent: { resume: "synthetic-ai-llm", dev: ["tencent-hunyuan-agent-harness-engineer", "bytedance-agent-eval-engineer-aily"], heldout: ["tencent-pcg-ai-app-agent", "tencent-csig-llm-app-agent", "shailab-agent-rd-intern-2027"] },
  backend: { resume: "synthetic-backend", dev: ["tencent-hunyuan-backend", "tencent-wechat-backend-ai"], heldout: ["tencent-wechat-core-backend", "tencent-ai-backend-gameagent"] },
  frontend: { resume: "synthetic-frontend", dev: ["tencent-miniprogram-frontend", "tencent-marvis-frontend"], heldout: ["tencent-valorant-frontend-ai", "alibaba-ai-fullstack-intern-2027"] },
  test: { resume: "synthetic-test-qa", dev: ["tencent-cloud-test-dev-ai-eval", "bytedance-test-dev-tiktok"], heldout: ["tencent-wechat-store-test-dev", "tencent-test-dev-ai-software"] },
  infra: { resume: "synthetic-infra", dev: ["alibaba-ai-infra-container", "tencent-agent-infra-senior"], heldout: ["alibaba-qwen-infra-intern-2027"] },
};

const competencySchema = z.object({
  competencies: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,30}$/), name: z.string().min(2).max(30), description: z.string().min(4).max(80), weight: z.union([z.literal(1), z.literal(2), z.literal(3)]) }))
    .min(4)
    .max(7),
});

const factsSchema = z.object({
  wrong: z.array(z.object({ topic: z.string().max(30), says: z.string().min(8).max(120), whyWrong: z.string().min(4).max(200) })).min(3).max(4),
  inflated: z.array(z.object({ topic: z.string().max(30), resume: z.string().min(2).max(60), says: z.string().min(2).max(60) })).min(2).max(3),
  hollow: z.array(z.object({ topic: z.string().max(30), resume: z.string().min(4).max(80) })).min(2).max(3),
});

/** mulberry32：种子相同结果相同。 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)];

/** 画像决定水平分布：扎实多数 high、一项 medium；一知半解多数 medium、一项 low；其余三档均匀。 */
function sampleLevels(competencies: Competency[], style: CandidateStyle, random: () => number): Record<string, BenchLevel> {
  const weak = Math.floor(random() * competencies.length);
  const out: Record<string, BenchLevel> = {};
  competencies.forEach((c, index) => {
    if (style === "solid") out[c.id] = index === weak ? "medium" : "high";
    else if (style === "shaky") out[c.id] = index === weak ? "low" : "medium";
    else out[c.id] = pick(random, BENCH_LEVELS);
  });
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const set = (args[args.indexOf("--set") + 1] ?? "dev") as "dev" | "heldout";
  const perJd = set === "dev" ? 3 : 2;
  const model = await resolveModel(env.taskBuilder.model);
  const outDir = path.join(BENCH_DIR, "tasks", set);
  fs.mkdirSync(outDir, { recursive: true });
  let index = 0;
  for (const [direction, spec] of Object.entries(DIRECTIONS)) {
    const resumeText = loadResumeText(spec.resume);
    for (const jdId of spec[set]) {
      const jd = loadJdFixture(jdId);
      console.log(`▶ ${direction} / ${jdId}`);
      const { output: comp } = await runAgent({
        agent: "bench_task_builder",
        runId: `bench:build:${jdId}:competencies`,
        config: model,
        feature: "InterviewBench",
        promptVersion: env.taskBuilder.promptVersion,
        schema: competencySchema,
        maxOutputTokens: 1_200,
        timeoutMs: 90_000,
        untrustedInputs: "岗位描述",
        system: "从这份岗位描述里抽出 4 到 7 项这个岗位真正会在技术面试里考的能力，每项一个短 id（小写英文连字符）、一个中文名、一句描述（面试官靠它判断一个问题属于哪项）、一个权重：3 = JD 反复强调或岗位核心，2 = 明确要求，1 = 加分或边缘。不要抽软技能。只输出 JSON。",
        payload: { jobTitle: jd.title, jobDescription: jd.jobDescription },
        rescue: salvageJson(competencySchema),
      });
      const { output: facts } = await runAgent({
        agent: "bench_task_builder",
        runId: `bench:build:${jdId}:facts`,
        config: model,
        feature: "InterviewBench",
        promptVersion: env.taskBuilder.promptVersion,
        schema: factsSchema,
        maxOutputTokens: 1_600,
        timeoutMs: 90_000,
        untrustedInputs: "岗位描述与简历",
        system: `给一场技术面试的模拟候选人造"真实候选人会做的事"，三类都要：
- wrong：3–4 句技术上站不住、但一个半懂的人真的会说出来的具体陈述，话题要落在这份简历或这个岗位会聊到的技术点上（不要常识错误，要边界或机制错误），每句附一句为什么错。
- inflated：2–3 处简历上写了具体数字的地方，resume 逐字摘简历原文里带数字的短语，says 是把它说大一倍左右的说法。
- hollow：2–3 处简历上写了成果或数字、但候选人可以"说不出怎么量的"的地方，resume 逐字摘原文短语。
只输出 JSON。`,
        payload: { jobTitle: jd.title, jobDescription: jd.jobDescription, resume: resumeText },
        rescue: salvageJson(factsSchema),
      });
      for (let k = 0; k < perJd; k += 1) {
        index += 1;
        const seed = (set === "dev" ? 1000 : 2000) + index;
        const random = rng(seed);
        const style = pick(random, CANDIDATE_STYLES);
        const levels = sampleLevels(comp.competencies, style, random);
        // 三分之一任务不埋任何事（测误报）；其余埋 wrong 1–2、inflated 0–1、hollow 0–1。
        const noFacts = k % 3 === 2;
        const chosen: Fact[] = [];
        if (!noFacts) {
          const wrongs = [...facts.wrong].sort(() => random() - 0.5).slice(0, 1 + Math.floor(random() * 2));
          chosen.push(...wrongs.map((w): Fact => ({ type: "wrong", topic: w.topic, says: w.says, whyWrong: w.whyWrong })));
          if (random() < 0.7) {
            const inf = pick(random, facts.inflated);
            chosen.push({ type: "inflated", topic: inf.topic, resume: inf.resume, says: inf.says });
          }
          if (random() < 0.7) {
            const hol = pick(random, facts.hollow);
            chosen.push({ type: "hollow", topic: hol.topic, resume: hol.resume });
          }
        }
        const behaviors: (Behavior | null)[] = [null, null, "humble_lead", "long_answers", "help_loop", "manipulate", "off_resume_intro"];
        const behavior = pick(random, behaviors);
        const pace = pick(random, ["quick", "standard", "standard", "deep"] as const);
        const task: Task = {
          id: `e2e-${set}-${String(index).padStart(3, "0")}`,
          set,
          job: { title: jd.title, company: jd.company, description: jd.jobDescription, source: `eval/jd/${jdId}.json` },
          resume: { text: resumeText, source: `eval/resumes/${spec.resume}.md` },
          competencies: comp.competencies,
          budget: { pace, maxTurns: MAX_TURNS[pace] },
          candidate: { style, seed, levels, facts: chosen.slice(0, 3), behavior },
        };
        fs.writeFileSync(path.join(outDir, `${task.id}.json`), JSON.stringify(task, null, 1));
        console.log(`  ${task.id} ${style} ${pace} facts=${task.candidate.facts.map((f) => f.type).join(",") || "-"} behavior=${behavior ?? "-"}`);
      }
    }
  }
  console.log(`\n${index} 个任务写到 ${path.relative(process.cwd(), outDir)}。人工过一遍每个 JD 的能力清单与 wrong 埋点是否真的错，再进仓库。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

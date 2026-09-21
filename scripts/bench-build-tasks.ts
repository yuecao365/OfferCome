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
 *   npm run bench:build -- --repair dev         # 不重造：给已有任务的埋点补 competencyId，并把落在 high 能力上的 wrong / hollow 埋点去掉
 * 模型来自 eval/bench/env.json 的 taskBuilder。
 *
 * 埋点与水平互斥：wrong 只能落在真值 medium 的能力上（笃定地说错一句是"半懂"的画像：high 不会说错，low 连机制都不许说）；
 * hollow 不能落在 high 上（精通的人说得出怎么量）；inflated 不受限（把数字说大是撒谎，不是不懂）。
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
    .array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/), name: z.string().min(2).max(30), description: z.string().min(4).max(80), weight: z.union([z.literal(1), z.literal(2), z.literal(3)]) }))
    .min(4)
    .max(7),
});

const factsSchema = z.object({
  wrong: z.array(z.object({ topic: z.string().max(30), competencyId: z.string(), says: z.string().min(8).max(120), whyWrong: z.string().min(4).max(200) })).min(3).max(5),
  inflated: z.array(z.object({ topic: z.string().max(30), competencyId: z.string(), resume: z.string().min(2).max(60), says: z.string().min(2).max(60) })).min(2).max(3),
  hollow: z.array(z.object({ topic: z.string().max(30), competencyId: z.string(), resume: z.string().min(4).max(80) })).min(2).max(4),
});

/** 埋点落在哪项能力上（模型给的 id 不在清单里就记 null，采样时当作不受限）。 */
const competencyIdOf = (competencies: Competency[], id: string): string | null => (competencies.some((c) => c.id === id) ? id : null);
/** wrong 只落 medium；hollow 不落 high；inflated 不限。能力归属未知（null）的当作不受限。 */
const compatible = (fact: Fact, levels: Record<string, BenchLevel>): boolean => {
  if (fact.type === "inflated" || fact.competencyId === null) return true;
  const level = levels[fact.competencyId];
  return fact.type === "wrong" ? level === "medium" : level !== "high";
};

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

/** 给已有任务补 competencyId（一次模型调用一个任务）并去掉与水平冲突的 wrong / hollow 埋点；文件原地改。 */
async function repair(set: string) {
  const model = await resolveModel(env.taskBuilder.model);
  const dir = path.join(BENCH_DIR, "tasks", set);
  const assignSchema = z.object({ assignments: z.array(z.object({ index: z.number().int(), competencyId: z.string() })) });
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const full = path.join(dir, file);
    const task = JSON.parse(fs.readFileSync(full, "utf8")) as Task;
    const missing = task.candidate.facts.map((f, index) => ({ f, index })).filter(({ f }) => f.competencyId === undefined);
    if (missing.length > 0) {
      const { output } = await runAgent({
        agent: "bench_task_builder",
        runId: `bench:repair:${task.id}`,
        config: model,
        feature: "InterviewBench",
        promptVersion: env.taskBuilder.promptVersion,
        schema: assignSchema,
        maxOutputTokens: 400,
        timeoutMs: 60_000,
        untrustedInputs: "埋点与能力清单",
        system: `下面每条"候选人会说的话"主要考的是哪项岗位能力？给每条一个 competencyId（只能从清单选）。能力清单：\n${task.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n")}\n输出 JSON：assignments = [{ index, competencyId }]。`,
        payload: { facts: missing.map(({ f, index }) => ({ index, topic: f.topic, text: f.type === "hollow" ? f.resume : f.says })) },
        rescue: salvageJson(assignSchema),
      });
      for (const { f, index } of missing) f.competencyId = competencyIdOf(task.competencies, output.assignments.find((a) => a.index === index)?.competencyId ?? "");
    }
    const before = task.candidate.facts.length;
    task.candidate.facts = task.candidate.facts.filter((f) => compatible(f, task.candidate.levels));
    const removed = before - task.candidate.facts.length;
    // 去掉冲突后不足两条、且不是设计上"不埋点"的任务：在非 high 的能力上补一条 wrong、一条 hollow（补回被去掉的那两类）。
    const byDesignEmpty = Number(task.id.slice(-3)) % 3 === 0;
    const wrongHosts = task.competencies.filter((c) => task.candidate.levels[c.id] === "medium");
    const hollowHosts = task.competencies.filter((c) => task.candidate.levels[c.id] !== "high");
    let added = 0;
    const need = (["wrong", "hollow"] as const).filter((type) => !task.candidate.facts.some((f) => f.type === type) && (type === "wrong" ? wrongHosts : hollowHosts).length > 0);
    if (!byDesignEmpty && task.candidate.facts.length < 2 && need.length > 0) {
      const topUpSchema = z.object({
        wrong: z.object({ topic: z.string().max(30), competencyId: z.string(), says: z.string().min(8).max(120), whyWrong: z.string().min(4).max(200) }).nullable(),
        hollow: z.object({ topic: z.string().max(30), competencyId: z.string(), resume: z.string().min(4).max(80) }).nullable(),
      });
      const { output } = await runAgent({
        agent: "bench_task_builder",
        runId: `bench:topup:${task.id}`,
        config: model,
        feature: "InterviewBench",
        promptVersion: env.taskBuilder.promptVersion,
        schema: topUpSchema,
        maxOutputTokens: 600,
        timeoutMs: 60_000,
        untrustedInputs: "岗位描述与简历",
        system: `给一场技术面试的模拟候选人补埋点。要补的：${need.join("、")}（不需要的填 null）。
- wrong：一句技术上站不住、但一个半懂的人真的会说出来的具体陈述，话题落在这份简历或这个岗位会聊到的技术点上（不要常识错误，要边界或机制错误），附一句为什么错。competencyId 只能从这些里选：\n${wrongHosts.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n") || "（无）"}
- hollow：一处简历上写了**带数字的成果**、但候选人可以"说不出怎么量的"的地方，resume 逐字摘原文短语（必须含数字）。competencyId 只能从这些里选：\n${hollowHosts.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n") || "（无）"}
只输出 JSON。`,
        payload: { jobTitle: task.job.title, jobDescription: task.job.description, resume: task.resume.text },
        rescue: salvageJson(topUpSchema),
      });
      if (need.includes("wrong") && output.wrong) {
        const fact: Fact = { type: "wrong", topic: output.wrong.topic, competencyId: competencyIdOf(task.competencies, output.wrong.competencyId), says: output.wrong.says, whyWrong: output.wrong.whyWrong };
        if (compatible(fact, task.candidate.levels) && fact.competencyId) task.candidate.facts.push(fact), (added += 1);
      }
      if (need.includes("hollow") && output.hollow && task.resume.text.includes(output.hollow.resume) && /\d/.test(output.hollow.resume)) {
        const fact: Fact = { type: "hollow", topic: output.hollow.topic, competencyId: competencyIdOf(task.competencies, output.hollow.competencyId), resume: output.hollow.resume };
        if (compatible(fact, task.candidate.levels) && fact.competencyId) task.candidate.facts.push(fact), (added += 1);
      }
      task.candidate.facts = task.candidate.facts.slice(0, 3);
    }
    fs.writeFileSync(full, JSON.stringify(task, null, 1));
    console.log(`  ${task.id}: ${task.candidate.facts.map((f) => `${f.type}@${f.competencyId ?? "?"}`).join(",") || "-"}${removed ? `（去掉 ${removed} 条与 high 冲突的）` : ""}${added ? `（补 ${added} 条）` : ""}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--repair")) return repair(args[args.indexOf("--repair") + 1] ?? "dev");
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
        system: `给一场技术面试的模拟候选人造"真实候选人会做的事"，三类都要，每条标明它主要落在哪项岗位能力上（competencyId，从下面清单选）：
- wrong：3–5 句技术上站不住、但一个半懂的人真的会说出来的具体陈述，话题要落在这份简历或这个岗位会聊到的技术点上（不要常识错误，要边界或机制错误），每句附一句为什么错；尽量分散在不同能力上。
- inflated：2–3 处简历上写了具体数字的地方，resume 逐字摘简历原文里带数字的短语，says 是把它说大一倍左右的说法。
- hollow：2–4 处简历上写了**带数字的成果**、但候选人可以"说不出怎么量的"的地方，resume 逐字摘原文短语（必须含数字、必须逐字）；尽量分散在不同能力上。
能力清单：\n${comp.competencies.map((c) => `- ${c.id}：${c.name}（${c.description}）`).join("\n")}
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
        // 三分之一任务不埋任何事（测误报）；其余埋 wrong 1–2、inflated 0–1、hollow 0–1，只从与水平相容的候选里挑。
        const noFacts = k % 3 === 2;
        const chosen: Fact[] = [];
        if (!noFacts) {
          const pool = {
            wrong: facts.wrong.map((w): Fact => ({ type: "wrong", topic: w.topic, competencyId: competencyIdOf(comp.competencies, w.competencyId), says: w.says, whyWrong: w.whyWrong })).filter((f) => compatible(f, levels)),
            inflated: facts.inflated.map((i): Fact => ({ type: "inflated", topic: i.topic, competencyId: competencyIdOf(comp.competencies, i.competencyId), resume: i.resume, says: i.says })),
            hollow: facts.hollow
              .filter((h) => resumeText.includes(h.resume) && /\d/.test(h.resume))
              .map((h): Fact => ({ type: "hollow", topic: h.topic, competencyId: competencyIdOf(comp.competencies, h.competencyId), resume: h.resume }))
              .filter((f) => compatible(f, levels)),
            inflatedOk: facts.inflated.filter((i) => resumeText.includes(i.resume)),
          };
          chosen.push(...[...pool.wrong].sort(() => random() - 0.5).slice(0, 1 + Math.floor(random() * 2)));
          if (random() < 0.7 && pool.inflatedOk.length) chosen.push(pick(random, pool.inflated.filter((f) => f.type === "inflated" && pool.inflatedOk.some((i) => i.resume === f.resume))));
          if (random() < 0.7 && pool.hollow.length) chosen.push(pick(random, pool.hollow));
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

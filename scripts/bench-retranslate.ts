import fs from "node:fs";
import path from "node:path";

import { flushAgentRunPersistence, installAgentRunPersistence, setAgentRunTag } from "../src/lib/ai/agent-run-store";
import { prisma } from "../src/lib/db";
import { gradeEpisode, summarize, type EpisodeGrade } from "../src/lib/evals/bench/grade";
import { OFFERCOME_TRANSLATION_VERSION, translateReport } from "../src/lib/evals/bench/submissions/offercome";
import { INTERVIEW_NORMS, type Episode, type Task } from "../src/lib/evals/bench/types";
import { getAiTaskConfig } from "../src/lib/settings/ai";

/**
 * 对已跑完的 offercome 场次统一重翻译评分卡（面试不重跑）：会话按 evalTag + companyName 从库里找回，
 * 用当前版本的翻译提示词重出评分卡，再用当前评分器重算。跑批中途改了翻译提示词时用它，保证 30 场口径一致。
 *
 *   npm run bench:retranslate -- --label dev-v2
 */

const BENCH_DIR = path.join(process.cwd(), "eval", "bench");

async function main() {
  const argv = process.argv.slice(2);
  const label = argv[argv.indexOf("--label") + 1];
  if (!label) throw new Error("--label 必填");
  const file = path.join(BENCH_DIR, "runs", `e2e-${label}-offercome.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { set: string; episodes: (Episode & { grade?: EpisodeGrade })[]; summary: unknown; translation?: string };
  const translator = { ...(await getAiTaskConfig("text")), task: "scoring" as const };
  installAgentRunPersistence();
  setAgentRunTag(`bench-e2e:${label}:retranslate`);
  const items: { task: Task; episode: Episode; grade: EpisodeGrade }[] = [];
  for (const raw of data.episodes) {
    const task = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "tasks", data.set, `${raw.taskId}.json`), "utf8")) as Task;
    const { grade: _old, ...episode } = raw;
    if (episode.error === null) {
      const session = await prisma.mockInterviewSession.findFirst({
        where: { interview: { evalTag: `bench-e2e:${label}`, companyName: `bench ${task.id}` } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!session) console.log(`  ${task.id}: 库里找不到会话，保留原评分卡`);
      else {
        try {
          episode.scorecard = await translateReport({ id: task.id, job: task.job, resume: task.resume, competencies: task.competencies, budget: task.budget, norms: INTERVIEW_NORMS }, session.id, translator);
        } catch (error) {
          console.log(`  ${task.id}: 重翻译失败，保留原评分卡：${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
        }
      }
    }
    const grade = gradeEpisode(task, episode);
    items.push({ task, episode, grade });
    console.log(`  ${task.id}: 评了 ${grade.judgement.rated}/${grade.judgement.total} · 等级 ${grade.judgement.exact}/${grade.judgement.rated} · 红旗 ${grade.facts.facts.filter((f) => f.flagged).length}/${grade.facts.facts.filter((f) => f.said).length} 误报 ${grade.facts.falsePositives} · ${grade.pass ? "过" : "不过"}`);
  }
  const summary = summarize("offercome", items);
  fs.writeFileSync(file, JSON.stringify({ ...data, translation: OFFERCOME_TRANSLATION_VERSION, summary, episodes: items.map((item) => ({ ...item.episode, grade: item.grade })), retranslatedAt: new Date().toISOString() }, null, 1));
  console.log(`→ ${path.relative(process.cwd(), file)}（翻译 ${OFFERCOME_TRANSLATION_VERSION}）`);
  await flushAgentRunPersistence();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

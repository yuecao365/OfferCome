import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

/**
 * 评测数据（`eval/`）的 schema 与加载：JD、合成简历、人设、静态脚本、评分器蜕变用例。
 * 人设与评分器用例由 `npm run eval -- fixtures` 生成后冻结进仓库，运行时只读。
 */

export const EVAL_DIR = path.join(process.cwd(), "eval");

export const JD_DIRECTIONS = ["backend", "frontend", "algorithm", "agent", "data", "test", "infra", "edge"] as const;

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
});
export type JdFixture = z.infer<typeof jdFixtureSchema>;

/** 人设：模拟器按它作答；weak.wrongClaim 与 unsupportable 是评测的已知真值。 */
export const personaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  jd: z.string().min(1),
  resume: z.string().min(1),
  style: z.string().min(1),
  strong: z.array(z.string().min(1)).min(1),
  weak: z.object({
    topic: z.string().min(1),
    /** 必须逐字说出的错误断言（Z）。 */
    wrongClaim: z.string().min(8),
    /** 生成时一并写下的错因，供人事后翻看，不进评测逻辑。 */
    whyWrong: z.string().min(1),
  }),
  /** 逐字取自简历、人设说不出细节的成果（C）。 */
  unsupportable: z.string().min(4),
  /** 每次先答一句再跑题讲社团与兴趣。 */
  offtopic: z.boolean().default(false),
});
export type Persona = z.infer<typeof personaSchema>;

export const CANDIDATE_INTENTS = ["hint", "clarify", "skip", "repeat", "end"] as const;

const scriptMessageSchema = z.object({
  content: z.string().optional(),
  intent: z.enum(CANDIDATE_INTENTS).optional(),
  repeat: z.number().int().min(1).max(20).optional(),
});

/** 静态脚本：不需要模拟器的场（求提示、注入、长文、中途结束）。 */
export const candidateScriptSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  jd: z.string().min(1),
  resume: z.string().min(1),
  intro: z.string().min(1),
  messages: z.array(scriptMessageSchema).min(1),
  /** 脚本耗尽仍未结束时轮流发的回答。 */
  filler: z.array(z.string().min(1)).min(1),
  /** 断言用的常量：注入组的 canary。 */
  canary: z.string().nullable().default(null),
});
export type CandidateScript = z.infer<typeof candidateScriptSchema>;
export type ScriptMessage = z.infer<typeof scriptMessageSchema>;

export const SCORER_VARIANTS = ["base", "err", "drop", "fluff", "para", "offtopic"] as const;
export type ScorerVariant = (typeof SCORER_VARIANTS)[number];

/** 评分器蜕变用例：一道真实产生的题 + 基准回答 + 五个变体，关系断言见 metamorphic.ts。 */
export const scorerCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** 来源题目（InterviewQuestion.id），只作追溯。 */
  questionId: z.string().min(1),
  jobTitle: z.string().min(1),
  jobDescription: z.string().min(1),
  round: z.string().nullable(),
  question: z.string().min(1),
  rubric: z.array(z.object({ name: z.string().min(1), description: z.string().optional(), weight: z.number().positive() })).min(1),
  expectedSignals: z.array(z.string()),
  thread: z.object({
    depth: z.number().int().min(0),
    targetDepth: z.number().int().min(0),
    probeCount: z.number().int().min(0),
    rescues: z.number().int().min(0),
    note: z.string().nullable(),
  }),
  answers: z.record(z.enum(SCORER_VARIANTS), z.string().min(1)),
  /** err 变体插入的错句与错因；drop 变体删掉的机制。 */
  truth: z.object({
    wrongClaim: z.string().min(8),
    whyWrong: z.string().min(1),
    droppedMechanism: z.string().min(1),
  }),
});
export type ScorerCase = z.infer<typeof scorerCaseSchema>;

function loadDir<T>(dir: string, schema: z.ZodType<T>): T[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const parsed = schema.parse(JSON.parse(readFileSync(path.join(dir, name), "utf8")));
      const id = (parsed as { id: string }).id;
      if (`${id}.json` !== name) throw new Error(`${dir}/${name} 的 id 与文件名不一致：${id}`);
      return parsed;
    });
}

export function loadJdFixtures(root = EVAL_DIR): JdFixture[] {
  return loadDir(path.join(root, "jd"), jdFixtureSchema);
}

export function loadJdFixture(id: string, root = EVAL_DIR): JdFixture {
  const jd = loadJdFixtures(root).find((item) => item.id === id);
  if (!jd) throw new Error(`没有 JD fixture：${id}`);
  return jd;
}

export function loadResumeText(id: string, root = EVAL_DIR): string {
  return readFileSync(path.join(root, "resumes", `${id}.md`), "utf8");
}

export function loadPersonas(root = EVAL_DIR): Persona[] {
  return loadDir(path.join(root, "personas"), personaSchema);
}

export function loadCandidateScripts(root = EVAL_DIR): CandidateScript[] {
  return loadDir(path.join(root, "scripts"), candidateScriptSchema);
}

export function loadScorerCases(root = EVAL_DIR): ScorerCase[] {
  return loadDir(path.join(root, "scorer"), scorerCaseSchema);
}

/** 生成器写冻结文件；已存在的不覆盖，除非 overwrite。 */
export function writeFixture(kind: "personas" | "scorer", value: { id: string }, root = EVAL_DIR, overwrite = false): boolean {
  const dir = path.join(root, kind);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${value.id}.json`);
  if (existsSync(file) && !overwrite) return false;
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return true;
}

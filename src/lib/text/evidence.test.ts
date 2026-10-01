import assert from "node:assert/strict";
import test from "node:test";

import { isVerbatimEvidence } from "./evidence";

test("quote-wrapped and prefixed evidence still counts as verbatim", () => {
  const jd = "1、负责 AI 应用后端服务建设，包括接口设计、服务开发、数据处理；\n2、熟悉 Prompt、RAG、Function Calling、MCP 者优先。";
  assert.equal(isVerbatimEvidence(jd, "接口设计、服务开发"), true);
  assert.equal(isVerbatimEvidence(jd, "“接口设计、服务开发、数据处理”"), true);
  assert.equal(isVerbatimEvidence(jd, "该岗位需要“熟悉 Prompt、RAG、Function Calling、MCP 者优先”"), true);
  assert.equal(isVerbatimEvidence(jd, "「数据处理」。"), true);
  // PDF 抽出来的文本会在换行处插进空格：同样的字就算逐字，空白不计。
  assert.equal(isVerbatimEvidence("在工具执行前加入 JSON Schema Validation Hook 校验模型生成参数,并将结构化错误回传给 LLM自纠", "在工具执行前加入JSON Schema Validation Hook校验模型生成参数,并将结构化错误回传给LLM自纠"), true);
  assert.equal(isVerbatimEvidence(jd, "接口设计、\n服务开发"), true);
  // 意译仍然不算逐字。
  assert.equal(isVerbatimEvidence(jd, "“负责智能体后端的搭建”"), false);
  assert.equal(isVerbatimEvidence(jd, "“”"), false);
});

test("English quotes: case, whitespace, typographic variants and trailing punctuation don't matter", () => {
  const jd = "You’ll design and build LLM-powered agents for 2–3 product teams.\nOwn the evaluation\npipeline end to end.";
  assert.equal(isVerbatimEvidence(jd, "you'll design and build llm-powered agents"), true);
  assert.equal(isVerbatimEvidence(jd, "“You’ll design and build LLM‑powered agents for 2-3 product teams.”"), true);
  assert.equal(isVerbatimEvidence(jd, "The JD asks candidates to \"Own the evaluation pipeline end to end\""), true);
  assert.equal(isVerbatimEvidence(jd, "Own the evaluation pipeline."), true);
  // 改写不算逐字。
  assert.equal(isVerbatimEvidence(jd, "Owns evaluation pipelines end to end"), false);
  assert.equal(isVerbatimEvidence(jd, "design and ship LLM agents"), false);
});

test("English quotes must start and end on word boundaries; Chinese quotes have no such constraint", () => {
  const resume = "Led the leadership offsite. Built a retrieval pipeline serving 2M users.";
  assert.equal(isVerbatimEvidence(resume, "lead"), false, "lead 不是 leadership 的逐字引用");
  assert.equal(isVerbatimEvidence(resume, "ership offsite"), false);
  assert.equal(isVerbatimEvidence(resume, "retrieval pipeline serving 2M"), true);
  assert.equal(isVerbatimEvidence(resume, "pipeline serving 2"), false, "数字也按词边界：2 不是 2M 的引用");
  // PDF 在换行处丢了空格的中英混排照旧：首尾是中文就不管词边界。
  assert.equal(isVerbatimEvidence("将结构化错误回传给LLM自纠", "回传给 LLM自纠"), true);
  assert.equal(isVerbatimEvidence("将结构化错误回传给LLM自纠", "LLM自纠"), true);
});

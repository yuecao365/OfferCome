import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_MEMORY, type InterviewMemory } from "@/lib/interview/memory";

import { createRecallTool, recallByKeyword } from "./recall";
import { createResumeLookupTool, lookupResumeLines } from "./resume-lookup";

/** 评分 agent 的只读工具（G2）：查简历原句、查上几场记忆。都是 read 档；没有上几场就不给 recall。 */

const resume = "字节跳动 · 后端实习\n- 负责 Agent 观测平台：单次查询 3000+ 步骤日志，首屏 1.5 秒内\n- 把某文件解析工具的 P95 从 2.8 秒降到 1.6 秒\n\n项目：Study Assistant\n- 记忆模块：向量检索 + 摘要";

test("查简历：按关键词返回包含它的行（逐字、去首尾空白、大小写不敏感）；空关键词返回空", async () => {
  assert.deepEqual(lookupResumeLines(resume, "p95"), ["- 把某文件解析工具的 P95 从 2.8 秒降到 1.6 秒"]);
  assert.deepEqual(lookupResumeLines(resume, "记忆"), ["- 记忆模块：向量检索 + 摘要"]);
  assert.deepEqual(lookupResumeLines(resume, "  "), []);
  const tool = createResumeLookupTool(resume);
  assert.equal(tool.access, "read");
  assert.deepEqual(await tool.execute?.({ keyword: "3000" }, { toolCallId: "t", messages: [], context: {} }), { keyword: "3000", lines: ["- 负责 Agent 观测平台：单次查询 3000+ 步骤日志，首屏 1.5 秒内"] });
});

test("查上几场：说法验证与短板按关键词命中、按时间倒序、最多 6 条；没有上几场不给工具", () => {
  const memory: InterviewMemory = {
    sessions: 2,
    claims: [{ text: "P95 从 2.8 秒降到 1.6 秒", evidence: "P95", status: "refuted", note: "说不出基线怎么测", at: "2026-09-01" }],
    competencies: [],
    weaknesses: [
      { point: "没说清 P95 的测量条件", quote: null, areaName: "观测平台", at: "2026-09-10" },
      { point: "记忆模块的淘汰策略没答", quote: null, areaName: "Study Assistant", at: "2026-09-05" },
    ],
    askedQuestions: [],
  };
  const hits = recallByKeyword(memory, "p95");
  assert.deepEqual(hits.map((hit) => [hit.kind, hit.at]), [["weakness", "2026-09-10"], ["claim", "2026-09-01"]]);
  assert.match(hits[1].text, /^被推翻：/);
  assert.equal(createRecallTool(memory)?.access, "read");
  assert.equal(createRecallTool(EMPTY_MEMORY), null);
});

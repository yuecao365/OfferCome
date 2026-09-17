import assert from "node:assert/strict";
import test from "node:test";

import { createRecallTool } from "./recall";
import { createResumeLookupTool, lookupLines } from "./resume-lookup";

/** 评分 agent 的只读工具（G2 / G4）：查简历原句、查候选人档案。都是 read 档；没有档案就不给 recall。 */

const resume = "字节跳动 · 后端实习\n- 负责 Agent 观测平台：单次查询 3000+ 步骤日志，首屏 1.5 秒内\n- 把某文件解析工具的 P95 从 2.8 秒降到 1.6 秒\n\n项目：Study Assistant\n- 记忆模块：向量检索 + 摘要";

test("查简历：按关键词返回包含它的行（逐字、去首尾空白、大小写不敏感）；空关键词返回空", async () => {
  assert.deepEqual(lookupLines(resume, "p95"), ["- 把某文件解析工具的 P95 从 2.8 秒降到 1.6 秒"]);
  assert.deepEqual(lookupLines(resume, "记忆"), ["- 记忆模块：向量检索 + 摘要"]);
  assert.deepEqual(lookupLines(resume, "  "), []);
  const tool = createResumeLookupTool(resume);
  assert.equal(tool.access, "read");
  assert.deepEqual(await tool.execute?.({ keyword: "3000" }, { toolCallId: "t", messages: [], context: {} }), { keyword: "3000", lines: ["- 负责 Agent 观测平台：单次查询 3000+ 步骤日志，首屏 1.5 秒内"] });
});

test("查档案：按关键词逐行取；没有档案不给工具", async () => {
  const dossier = "# 候选人档案\n\n## 已验证的说法\n- 2026-09-01 · Agent 开发：P95 从 2.8 秒降到 1.6 秒（讲清了基线）\n\n## 反复出现的短板\n- 没说清 P95 的测量条件 ×2 场";
  const recall = createRecallTool(dossier)!;
  assert.equal(recall.access, "read");
  assert.deepEqual(await recall.execute?.({ keyword: "p95" }, { toolCallId: "t", messages: [], context: {} }), { keyword: "p95", lines: ["- 2026-09-01 · Agent 开发：P95 从 2.8 秒降到 1.6 秒（讲清了基线）", "- 没说清 P95 的测量条件 ×2 场"] });
  assert.equal(createRecallTool(null), null);
  assert.equal(createRecallTool("   "), null);
});

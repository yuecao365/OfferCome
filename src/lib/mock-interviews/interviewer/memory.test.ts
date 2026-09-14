import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { applyMemoryPatch, emptyMemory, parseStoredMemory, sameEntry, type MemoryPatch } from "./memory";

/** 阈值按真实会话（2026-09-14 第一场第 19 回合）里的重复条目定：这些要合并，那些不能合并。 */

const patch = (extras: Partial<MemoryPatch>): MemoryPatch => ({ established: [], doubtful: [], failed: [], hypotheses: [], ...extras });

test("换了措辞的同一件事算同一条；不同的事不算", () => {
  const same: [string, string][] = [
    ["目标是和真实行为分布做对比", "目标是和真实行为分布对比"],
    ["多智能体仿真系统的整体流程还没讲清", "多智能体仿真系统的整体流程仍未讲清"],
    ["多智能体仿真是课程项目，模拟社交平台上几十个 agent 的发帖互动", "多智能体仿真是课程项目，模拟社交平台上几十个 agent 的发帖互动，并与真实行为分布对比"],
    ["该项目是模拟社交平台上几十个 agent 的发帖互动，并与真实行为分布对比", "多智能体仿真是课程项目，模拟社交平台上几十个 agent 的发帖互动，并与真实行为分布对比"],
    ["候选人负责 action 协议和评估指标：时间分布误差、JSD、重合率", "候选人负责多智能体仿真系统的 action 协议和评估指标"],
    ["状态、动作、环境、评估四块职责仍待展开", "状态、动作、环境、评估四块职责仍未展开"],
    ["多智能体仿真系统的完整闭环仍没讲清", "多智能体仿真系统的整体流程仍未讲清"],
  ];
  for (const [left, right] of same) assert.ok(sameEntry(left, right), `应合并：${left} / ${right}`);
  const different: [string, string][] = [
    ["候选人负责 action 协议和评估指标：时间分布误差、JSD、重合率", "Study Assistant 里主循环是上下文构建→模型推理→工具调用→回填 observation"],
    ["对话原文、滚动摘要、常驻记忆、可检索记忆的边界还未讲清", "常驻记忆和 pinned memory 的写入/晋升机制仍未验证"],
    ["结构化动作协议的无效动作率口径仍未讲清", "多智能体仿真系统的整体闭环和评估输入输出还没讲清"],
    ["无效调用率从 30% 降到 12%", "无效调用率的基线是加校验前同一批任务"],
  ];
  for (const [left, right] of different) assert.ok(!sameEntry(left, right), `不该合并：${left} / ${right}`);
});

test("同一列表里相似的合成一条：留更长的那句，回合号取新的，位置不变", () => {
  const brief = testBrief();
  let memory = applyMemoryPatch(emptyMemory(brief), patch({ established: ["目标是和真实行为分布对比", "候选人负责 action 协议"] }), { turn: 3, areaId: "p1-overview" });
  memory = applyMemoryPatch(memory, patch({ established: ["目标是和真实行为分布做对比", "候选人负责多智能体仿真系统的 action 协议和评估指标"] }), { turn: 5, areaId: "p2-overview" });
  assert.deepEqual(
    memory.established.map((item) => [item.text, item.turn, item.areaId]),
    [
      ["目标是和真实行为分布做对比", 5, "p1-overview"],
      ["候选人负责多智能体仿真系统的 action 协议和评估指标", 5, "p1-overview"],
    ],
  );
});

test("写进已确认或失守的条目把存疑里相似的那条去掉；存疑与已确认相似的不动", () => {
  const brief = testBrief();
  let memory = applyMemoryPatch(emptyMemory(brief), patch({ doubtful: ["多智能体仿真系统的整体流程还没讲清", "无效动作率口径仍未讲清"] }), { turn: 2, areaId: null });
  memory = applyMemoryPatch(memory, patch({ established: ["多智能体仿真系统的整体流程已讲清：状态 → 观察 → 动作 → 状态"], failed: ["无效动作率口径没讲清"] }), { turn: 4, areaId: null });
  assert.deepEqual(memory.doubtful, []);
  assert.equal(memory.established.length, 1);
  assert.equal(memory.failed.length, 1);
  const doubted = applyMemoryPatch(memory, patch({ doubtful: ["无效动作率的口径还得再验"] }), { turn: 5, areaId: null });
  assert.equal(doubted.doubtful.length, 1);
  assert.equal(doubted.failed.length, 1);
});

test("旧会话按逐字去重存的重复条目，读出来时合并", () => {
  const brief = testBrief();
  const stored = JSON.stringify({
    established: [
      { areaId: null, text: "目标是和真实行为分布做对比", turn: 3 },
      { areaId: null, text: "目标是和真实行为分布对比", turn: 6 },
      { areaId: null, text: "候选人负责 action 协议和评估指标", turn: 7 },
    ],
    doubtful: [],
    failed: [],
    hypotheses: [],
  });
  const memory = parseStoredMemory(stored, brief);
  assert.deepEqual(memory.established.map((item) => item.text), ["目标是和真实行为分布做对比", "候选人负责 action 协议和评估指标"]);
  assert.equal(memory.hypotheses.length, brief.hypotheses.length, "空的假设列表用简报的");
});

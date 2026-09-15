import assert from "node:assert/strict";
import test from "node:test";

import { event, parseEventRow, transcriptOf, type InterviewEvent, type NewEvent } from "../events";
import { helpHandling, repeatedQuestionCount, sessionMetrics, summarize, type SegmentFact } from "./metrics";

function events(list: NewEvent[]): InterviewEvent[] {
  return list.map((item, seq) => parseEventRow({ seq, type: item.type, payloadJson: JSON.stringify(item.payload), runId: item.runId ?? null, createdAt: new Date() })!);
}

const say = (content: string, kind = "probe") => event("interviewer_said", { content, kind });
const answer = (content: string, control: "hint" | "repeat" | null = null) => event("candidate_said", { content, clientId: null, control, composeMs: null });

test("重复提问：问法几乎一样的算一次；答疑与收尾不算", () => {
  const transcript = events([
    say("你好，先介绍一下自己。", "intro_request"),
    answer("我叫小王。"),
    say("你先把这个系统的完整链路讲一下：从一个 agent 生成动作开始，到环境更新、再到评估结果产出，这四块分别怎么连起来？"),
    answer("按同一批任务算的。"),
    say("那你继续把这个仿真系统的整体链路讲完：从一个 agent 生成动作开始，到环境更新、再到评估结果产出，这四块分别怎么连起来？"),
    answer("再说一遍", "repeat"),
    say("那你继续把这个仿真系统的整体链路讲完：从一个 agent 生成动作开始，到环境更新、再到评估结果产出，这四块分别怎么连起来？", "aside"),
    answer("按 40 条任务的平均 token。"),
    say("今天先到这里。", "closing"),
  ]);
  assert.equal(repeatedQuestionCount(transcriptOf(transcript)), 1);
});

test("求助识别与处理：按钮与短句都算求助；下一句不是新题就算处理了", () => {
  const lines = transcriptOf(
    events([
      say("先讲主循环。", "question"),
      answer("具体点"),
      say("那就只讲一步：参数校验怎么做。", "aside"),
      answer("这题我不太会，能给个方向吗？", "hint"),
      say("换个题：缓存怎么失效？", "question"),
      answer("这是一段很长的正常回答，里面提到了具体一点这个词但显然不是求助，因为它超过了四十个字的上限，属于正常作答。"),
      say("那再往下问。"),
    ]),
  );
  assert.deepEqual(helpHandling(lines), { requests: 2, handled: 1 });
});

test("一场的指标：覆盖、预算、求助、开销都从事件与分段算；汇总取均值与比例", () => {
  const facts = {
    sessionId: "s1",
    turnsTotal: 12,
    events: events([
      say("你好", "intro_request"),
      answer("自我介绍"),
      say("先聊项目 A", "question"),
      answer("……"),
      say("追一层", "probe"),
      answer("具体点"),
      say("只讲这一步", "aside"),
      answer("……"),
      say("场景题：……", "question"),
      answer("……"),
      say("再见", "closing"),
      event("fallback_used", { reason: "模型没说出话" }),
      event("ended", { by: "budget" }),
    ]),
    segments: [
      { kind: "project", areaId: "p1-overview", projectId: "p1", depth: 2, answered: true, startSeq: 2, endSeq: 7 },
      { kind: "project", areaId: "p1-module", projectId: "p1", depth: 0, answered: true, startSeq: 8, endSeq: 9 },
      { kind: "quick", areaId: "q1", projectId: null, depth: 1, answered: true, startSeq: 10, endSeq: 11 },
      { kind: "scenario", areaId: "s1", projectId: null, depth: 0, answered: false, startSeq: 12, endSeq: 13 },
    ] satisfies SegmentFact[],
    runs: [
      { runId: "r1", durationMs: 1000, inputTokens: 10_000, cachedTokens: 8_000, outputTokens: 300 },
      { runId: "r2", durationMs: 3000, inputTokens: 12_000, cachedTokens: 10_000, outputTokens: 400 },
    ],
  };
  const metrics = sessionMetrics(facts);
  assert.equal(metrics.interviewerTurns, 5);
  assert.equal(metrics.asides, 1);
  assert.equal(metrics.endedBy, "budget");
  assert.equal(metrics.budgetKept, true);
  assert.equal(metrics.projectsCovered, 1);
  assert.equal(metrics.facesPerProject, 2);
  assert.equal(metrics.quickCount, 1);
  assert.equal(metrics.scenarioAsked, true);
  assert.equal(metrics.scenarioAnswered, false);
  assert.equal(metrics.projectProbeDepth, 1);
  assert.equal(metrics.helpRequests, 1);
  assert.equal(metrics.helpHandledRate, 1);
  assert.equal(metrics.fallbacks, 1);
  assert.equal(metrics.tokens.cacheRate.toFixed(2), "0.82");
  assert.equal(metrics.latencyMs.p95, 3000);
  const summary = summarize([metrics, { ...metrics, scenarioAsked: false, helpRequests: 0, helpHandledRate: null }]);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.scenarioAsked, 0.5);
  assert.equal(summary.helpHandledRate, 1);
  assert.equal(summary.inputTokensPerSession, 22_000);
});

import assert from "node:assert/strict";
import test, { before, mock } from "node:test";

mock.module("server-only", { namedExports: {} });

let composeTrialResumeText: typeof import("./resume")["composeTrialResumeText"];
let validateTrialResumeForm: typeof import("./resume")["validateTrialResumeForm"];

before(async () => {
  ({ composeTrialResumeText, validateTrialResumeForm } = await import("./resume"));
});

const validForm = {
  summary:
    "三年后端开发经验，主技术栈 Go 与 MySQL，做过高并发订单系统，关注缓存一致性与可观测性。",
  experiences: [
    {
      name: "订单中台重构",
      type: "project",
      organization: "某电商公司",
      description: "负责订单服务拆分与幂等设计，QPS 从 2k 提升到 8k，超时率下降 90%。",
    },
    {
      name: "支付网关实习",
      type: "internship",
      organization: "",
      description: "参与对账任务调度的开发，修复了三个资损相关的边界问题。",
    },
  ],
};

test("composes form input into the resume text the agents consume", () => {
  const text = composeTrialResumeText(validForm);

  assert.match(text, /## 个人概述\n三年后端开发经验/);
  // 有组织的经历带上组织名，没有的不留悬空分隔符。
  assert.match(text, /## 项目经历：订单中台重构 · 某电商公司/);
  assert.match(text, /## 实习经历：支付网关实习\n/);
  assert.match(text, /QPS 从 2k 提升到 8k/);
});

test("accepts a well-formed submission", () => {
  assert.equal(validateTrialResumeForm(validForm), null);
  // 只有概述、没有经历也允许——少一类题而已，不拦路。
  assert.equal(
    validateTrialResumeForm({ summary: validForm.summary, experiences: [] }),
    null,
  );
});

test("guides the visitor when the input is too thin to generate good questions", () => {
  assert.match(
    validateTrialResumeForm({ summary: "会写代码", experiences: [] }) ?? "",
    /至少写 30 个字/,
  );
  assert.match(
    validateTrialResumeForm({
      summary: validForm.summary,
      experiences: [{ name: "项目", type: "project", description: "做了点东西" }],
    }) ?? "",
    /至少写 20 个字/,
  );
  assert.match(
    validateTrialResumeForm({
      summary: validForm.summary,
      experiences: [{ name: "", type: "project", description: validForm.experiences[0]!.description }],
    }) ?? "",
    /有效的名称/,
  );
  assert.match(
    validateTrialResumeForm({
      summary: validForm.summary,
      experiences: [
        { name: "x", type: "volunteer", description: validForm.experiences[0]!.description },
      ],
    }) ?? "",
    /实习或项目/,
  );
});

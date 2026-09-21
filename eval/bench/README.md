# InterviewBench

评的是"一个模型（或一个系统）当技术面试官的基本功"，从真实面试的角度定义，与本项目的面试流程无关。设计见 [docs/interviewbench-plan.md](../../docs/interviewbench-plan.md)。

## 子任务层（`subtasks/`）

| 子任务 | 题数 | 语言 | 给什么 | 要什么 | 真值来源 | 指标 |
|---|---|---|---|---|---|---|
| s1-correctness | 56 | 中 | 一问一答 | 有没有技术错误 | 评分器用例：原版 vs 插入错句版（`eval/scorer`） | 准确率、平衡准确率、错句召回 |
| s1b-evidence | 60 | 英 | 一问一答 + rubric | 回答有没有实质证据 | Beyond the Resumé 裁判蜕变测试：夸大 / 无关 / 重复 = 无证据；低 / 中 / 高证据 = 有 | 平衡准确率 |
| s2-locate | 28 | 中 | 一问一答（含错） | 摘出错句 | 插入的错句 | 命中率（去标点后重叠 ≥ 8 字） |
| s3-next-question | 60 | 中 30 / 英 30 | 对话前缀 | 写下一问 | 真实面经的下一问（中）；BtR 面试官的下一问（英） | 人工判"同一意图"，标注文件在 `labels/` |
| s4-probe-or-switch | 40 | 英 | 对话前缀 | 追同一能力还是换 | BtR 裁判后验的维度变化（同维度 = 追）；不平衡（追 9 / 换 31），看平衡准确率 | 平衡准确率 |
| s5-level | 60 | 英 | 一问一答 + 该能力三档锚点 | low / medium / high | 模拟候选人的原型水平（低 / 中 / 高各 20） | 精确率、相邻率、二次加权 κ |
| s6-scorecard | 60 | 英 | 整场 24 回合逐字稿 + 简历 + 六维 rubric | 每维等级 + 依据 + 红旗 + 结论 | 模拟候选人的原型（6 种 × 10 份简历）；BtR 报 GPT-5 裁判原型识别率 76.1% | 原型识别率、每维精确率、等级 MAE |

英文题来自 [Beyond the Resumé](https://github.com/mbzuai-nlp/beyond-the-resume)（MBZUAI，MIT 许可，commit 21e3487）的 ML 工程方向子集，快照在 `external/btr/`；中文题来自本仓库的评分器用例与 80 篇公开面经里 27 篇有完整提问链的。

## 跑法

```
npm run bench -- --tasks s1,s1b,s2,s4,s5,s6 --models main --label <label>
npm run bench -- --tasks s3 --models main --label <label>        # 生成下一问 → labels/ 人工判
```

`main` 是设置页的文本模型；其他模型用环境变量 `BENCH_MODEL_<name>`（JSON，形状同设置页配置）并在 `--models main,<name>` 里点名。产物 `runs/<label>-<task>-<model>.json`（不进仓库），结果表汇总在 `results.md`。

## 局限

- 英文子任务的候选人是 GPT-5 模拟的，回答比真人整齐；它们测的是"面试官能否从回答里读出水平"，不测"真人会怎么答"。
- s4 的真值由另一个 LLM 裁判的后验变化推得，不是人标的；用前抽检。
- s3 只有人工判定，标注只有一人，报自身复标一致性作上限。
- 端到端层（模拟面试 + pass^k）见设计文档 §2.2，尚未建。

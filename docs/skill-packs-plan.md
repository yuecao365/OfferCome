# 面试技能包（Skill Packs）P0 实施计划

2026-08-17。目标：治"八股题空洞"——把领域面试知识打包成分层技能包注入出题 agent；JD 降级为方向信号。对齐 Anthropic Agent Skills 规范（frontmatter 触发、渐进式披露、好/坏示例驱动）。

## 一、三层结构

| 层 | 命中规则 | 内容职责 | 预算 |
|---|---|---|---|
| **base 基座** | 无条件注入 | 跨领域通用：项目深挖追问链、通用工程素养、出题总原则 | ~500 tk |
| **domain 领域** | 按方向命中 1 个 | 架构与方法论（栈无关）：如 backend 的可扩展性/缓存一致性/系统设计出题思路 | ~700 tk |
| **stack 技术栈** | 按简历+JD 命中 1–2 个 | 仅栈特有细节：深度阶梯、好题/坏题、易混考点 | ~500 tk/包 |

组合规则：命中 stack → 自动上溯 parent 领域包 + 基座包。总注入 ≤2200 token。

## 二、P0 默认包清单

```
base:    project-deep-dive
domain:  backend | frontend | ai-llm | cs-fundamentals(技术岗兜底) | algorithm
stack:   backend/java  backend/go  frontend/react  frontend/vue
```

P0 共 10 个包。ai-llm 与 algorithm 暂不细分栈（内容本身跨栈）；后续加栈只写差异（如 backend/python）。

## 三、文件与格式约定

- 存放 `src/lib/mock-interviews/skills/`，每包一个 TS 模块导出 markdown 字符串 + 类型化 frontmatter（零构建配置；用户自定义包 P1 才进 DB）；
- frontmatter：`name`（小写连字符）、`description`（是什么 + 何时用）、`keywords`（选择器匹配用）、`layer`、`parent`（stack 必填）；
- 正文统一五段：**出题原则 / 高频主题与深度阶梯 / 好题·坏题对比（每包≥3组）/ 项目结合钩子 / 期望信号提示**。base 层无"深度阶梯"段，改为"追问链模板"；
- 深度阶梯写法：`入门问法 → 原理 → 场景排查 → 权衡取舍`，全部从具体场景切入，禁止"谈谈你对 X 的理解"式坏题（坏题示例即现在生成的空洞题）。

## 四、选择器（纯函数 + 单测）

输入：岗位名 + JD 文本 + 简历文本。逻辑：
1. 对每个 stack/domain 包按 keywords 命中次数打分（简历权重 > 岗位名 > JD，呼应"JD 是弱信号"）；
2. 取 top stack ≤2，上溯其 parent；无 stack 命中时取得分最高 domain；全无命中 → `cs-fundamentals`；
3. 恒加 `project-deep-dive`；结果去重后按 base→domain→stack 顺序拼接。

## 五、出题提示词重构（同批完成）

- 新增"出题技能包"段落注入拼接后的内容，声明"技能包是可信的出题指导"；
- JD 降级："JD 可能宽泛或过时，仅用于判断岗位方向与技术栈，题目具体性以技能包与简历为准"；
- 排序层：jdEvidence 逐字加分从 0.15 降至 0.05；提示词版本升至 v5-skills；
- 期望信号段喂给追问与 rubric（沿用现有字段，无 schema 变更）。

## 六、透明与验证

- 创建页与报告页显示本场命中的技能包名（如：项目深挖 · 后端架构 · Java）；
- 单测：选择器命中/上溯/兜底/去重；技能包 frontmatter 合法性校验测试；
- 人工验收：同一岗位强弱两个模型各跑一场，对比改造前的空洞题。

## 七、不做（P0 边界）

用户自定义包 CRUD（P1）、agent 工具化自主选包（P2）、按评分数据迭代包内容（P2）。

## 八、实施顺序

1. 样例垂直链定调：`project-deep-dive` + `backend` + `backend/java` → **停下来给用户过目**；
2. 批准后铺开其余 7 包；
3. 选择器 + 注入 + 提示词重构 + 透明展示；
4. 测试 + 强弱模型对比验收。

预估 1–1.5 天（第 1 步约 2 小时）。

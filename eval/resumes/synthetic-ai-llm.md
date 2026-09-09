周景川
13900000000 | zhoujingchuan.ai@example.com | github.com/zhoujingchuan-lab

教育背景
北京邮电大学 计算机科学与技术 本科 2022年9月 – 2026年6月（预计）
· GPA 3.62 / 4.00，专业排名前 20%
· 主修课程：数据结构、操作系统、计算机网络、数据库系统、软件工程、机器学习基础

实习经历
某智能平台公司 AI 工程部 Agent 平台开发实习生 2025年6月 – 2025年9月
· 参与内部 LLM Agent 实验平台的后端开发，使用 Python（FastAPI）与 PostgreSQL 维护任务执行、结果记录与评测数据管理接口，支持研究同学配置多轮任务与批量回放。
· 参与搭建 Agent 调用链 tracing 原型，记录 prompt、工具调用、模型响应、耗时与错误信息等关键节点，补齐 12 类事件埋点，帮助团队将一次复杂任务的排查时间从平均 1 小时缩短到 20 分钟左右。
· 协助开发自动化 eval pipeline，编写数据清洗与评测脚本，支持按版本比较成功率、平均步数和工具报错率，在一次模型升级回归中提前发现网页检索工具调用成功率下降约 9 个百分点。
· 使用 pytest 补充接口与评测逻辑测试用例 50 余条，并接入 CI，实习期间拦截 3 次因字段兼容性引发的回归问题。

项目经历
Agent 运行观测与调试平台 2025年10月 – 2026年2月
基于 Python + FastAPI + React + PostgreSQL 开发的 Agent tracing 与 debugging 工具，用于可视化展示任务执行轨迹、定位失败步骤并对比不同版本表现。
· 设计任务、步骤、工具调用、模型输出四类核心数据模型，支持按 trace_id 聚合完整执行链路，并提供时间线视图与错误筛选，单次查询 3000+ 步骤日志时页面首屏加载时间控制在 1.5 秒内。
· 接入 OpenTelemetry 风格埋点，记录 token 数、首字延迟、工具耗时与重试次数等指标，基于 Grafana 看板观察到某文件解析工具 P95 耗时长期高于 2.8 秒，优化缓存后下降至 1.6 秒。
· 实现 Prompt diff、工具输入输出对比和失败样本回放功能，方便定位是模型规划问题、工具参数错误还是外部依赖异常；在自建 80 条 case 的调试集中，人工定位根因的平均时间缩短约 35%。
· 为关键接口和日志解析模块编写单元测试 45 条，使用 Docker Compose 搭建本地开发环境，减少多人协作时的环境不一致问题。

Agent 自动评测与回归检测系统 2025年3月 – 2025年8月
面向工具型 Agent 的离线评测项目，使用 Python、Celery、Redis 和 ECharts 构建批量评测、A/B 对比与回归告警流程。
· 搭建 eval pipeline，支持从数据集读取任务、并发执行 Agent、汇总成功率/步骤数/成本等指标，单批次可稳定跑完 500 条测试任务。
· 设计“最终结果 + 关键中间步骤”双层评分方式：最终结果由规则校验，过程质量由人工标注样本反哺 prompt 规则，在一版日程规划 Agent 上比只看最终结果更早发现 14 条工具选择错误。
· 实现 A/B testing 页面，按模型版本、prompt 版本和工具版本查看指标波动，并加入简单阈值告警；一次改动后及时发现平均步骤数从 4.3 上升到 5.1，避免了无效推理链路上线。
· 使用 pandas 清洗评测日志，统一异常类型与字段命名，减少后续分析脚本中的重复处理逻辑约 30%。

技能
· 语言：Python、TypeScript、Java、SQL
· 框架与组件：FastAPI、React、PostgreSQL、Redis、Celery、Docker
· AI / Agent：LLM 应用开发、Agent workflow、Function Calling、Prompt 设计、RAG、自动化评测、A/B Testing、Tracing / Observability
· 工具：Git、Linux、Pytest、Grafana、Cursor / Claude Code / Codex 辅助编程

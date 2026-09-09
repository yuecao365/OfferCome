# 面经语料（2025–2026 公开面经）

只用于备课的话题覆盖率评测（docs/eval.md §5）。每岗位 16 篇，题目由 `extract-questions.mjs` 按启发式抽出，允许有少量叙述噪声，后续用 aux 模型抽话题时过滤。

- `raw/`：抓取原文（.gitignore，不进仓库）
- `extracted/`：每篇的题目列表 + 来源 URL
- 重新抽取：`node eval/mianjing/extract-questions.mjs [文件名…]`（raw 里 fetched: full 的离线抽，其余联网）

## ai-llm（16 篇，254 题）

| 文件 | 公司 | 年份 | 题数 | 标题 | 来源 |
|---|---|---:|---:|---|---|
| ai-llm-4paradigm-01.json | 第四范式 |  | 10 | 29届第四范式agent开发实习面经（已过） | https://www.nowcoder.com/feed/main/detail/77a81a03b55143c89d1caf76833676d9 |
| ai-llm-alibaba-01.json | 阿里巴巴 |  | 6 | AI应用研发二面面经分享-阿里云 | https://www.nowcoder.com/feed/main/detail/b0a0fc09ba0b408c9df84d38c6d1eb83 |
| ai-llm-anruan-01.json | 安软 | 2026 | 41 | 安软｜AI 应用开发实习面经 | https://www.nowcoder.com/feed/main/detail/40920533fad14136bff01c3928c7e953 |
| ai-llm-ant-01.json | 蚂蚁集团 |  | 18 | 蚂蚁agent开发一面面经分享 | https://www.nowcoder.com/feed/main/detail/7a0ddb8e077041d4b72ba9e5290ad36a |
| ai-llm-bytedance-01.json | 字节跳动 |  | 19 | 字节AI Agent实习面经 | https://www.nowcoder.com/feed/main/detail/8a553bb6ea8445d0b0abe11e87614cea |
| ai-llm-bytedance-02.json | 字节跳动 |  | 10 | 字节后端agent开发实习一面 1h | https://www.nowcoder.com/feed/main/detail/d73020680b3b42c3ac579e2f25721d90 |
| ai-llm-bytedance-03.json | 字节跳动 |  | 13 | 字节agent全栈一面 | https://www.nowcoder.com/feed/main/detail/b62416eaa3764a9ba46269c0058019fd |
| ai-llm-duoyi-01.json | 多益网络 |  | 12 | 多益网络 AI应用工程师 一面 | https://www.nowcoder.com/feed/main/detail/f5f1a4daff104fcb8c48476ed9c99f39 |
| ai-llm-nio-01.json | 蔚来 |  | 23 | 蔚来Agent平台开发面经分享 27实习 | https://www.nowcoder.com/feed/main/detail/c759a618d89d49be897af49dbc961241 |
| ai-llm-other-01.json | 其他 |  | 10 | AI初创agent开发实习面经分享 | https://www.nowcoder.com/feed/main/detail/632b151ada3a404894f1dc1c30dcbd19 |
| ai-llm-other-02.json | 其他 |  | 18 | 成都某中厂agent产品开发实习面经 | https://www.nowcoder.com/feed/main/detail/d770696f3495465d9e3d40c3d631d54c |
| ai-llm-other-03.json | 其他 |  | 12 | 上海agent初创面经 | https://www.nowcoder.com/feed/main/detail/708ff271220c4ccf86da290e265dfc4a |
| ai-llm-other-04.json | 其他 |  | 9 | 某教育agent开发面经 | https://www.nowcoder.com/feed/main/detail/505159fb5f874d909c0c252f3f959ea0 |
| ai-llm-tencent-01.json | 腾讯 |  | 12 | 腾讯实习 ai应用开发后端面经分享 | https://www.nowcoder.com/feed/main/detail/144c6ae334b24c0aa643ed43ccfebaac |
| ai-llm-tencent-02.json | 腾讯 |  | 18 | 腾讯27实习 AI应用开发一面分享 | https://www.nowcoder.com/feed/main/detail/9c23964be69d4cd19f38b1b1e74cd177 |
| ai-llm-tencent-03.json | 腾讯 |  | 23 | 腾讯AI应用开发实习一面分享 攒人品夯版 | https://www.nowcoder.com/feed/main/detail/66e688eed16e4708af18c3a5efdb62b3 |

## frontend（16 篇，234 题）

| 文件 | 公司 | 年份 | 题数 | 标题 | 来源 |
|---|---|---:|---:|---|---|
| frontend-baidu-01.json | 百度 | 2026 | 8 | 百度 前端开发实习 面经 | https://www.nowcoder.com/discuss/911382260387962880 |
| frontend-bilibili-01.json | 哔哩哔哩 | 2026 | 10 | 哔哩哔哩公益前端一面 | https://www.nowcoder.com/discuss/919940728984207360 |
| frontend-bytedance-01.json | 字节跳动 | 2026 | 14 | 字节跳动 前端开发实习 面经（二面已挂） | https://www.nowcoder.com/discuss/899078261152509952 |
| frontend-kuaishou-01.json | 快手 | 2026 | 7 | 快手前端实习面经 | https://www.nowcoder.com/feed/main/detail/9d0912fb61294019874e8a4df1534a3e |
| frontend-kuaishou-02.json | 快手 | 2026 | 26 | 快手主站增长前端一面，问的老细了。。 | https://www.nowcoder.com/discuss/919940141462872064 |
| frontend-kuaishou-03.json | 快手 | 2026 | 22 | 快手增长前端二面 | https://www.nowcoder.com/discuss/919940466508857344 |
| frontend-meituan-01.json | 美团 | 2025 | 15 | 【前端面经】美团-核心本地商业-业务研发平台（暑期，oc） | https://www.nowcoder.com/feed/main/detail/7bf8d4ba32c745fd96e70dfc3ed4dd59 |
| frontend-meituan-02.json | 美团 | 2025 | 19 | 26前端找实习记录贴33 | https://www.nowcoder.com/discuss/742873401835950080 |
| frontend-other-01.json | 其他 |  | 8 | 广州某中大厂前端面经 | https://www.nowcoder.com/feed/main/detail/89e1ca097f38416c8fbc4ce8a53da77f |
| frontend-other-02.json | 其他 |  | 17 | 小厂前端面经（六） | https://www.nowcoder.com/feed/main/detail/89b9a26dfd234758979597c5370f03ee |
| frontend-shopee-01.json | Shopee | 2026 | 22 | 虾皮 前端开发实习 面经（三面已挂） | https://www.nowcoder.com/discuss/911378390463090688 |
| frontend-streamax-01.json | 锐明技术 |  | 14 | 深圳锐明技术前端面经 | https://www.nowcoder.com/feed/main/detail/2deffcdd02a04383bfdb0f48e5c95661 |
| frontend-tencent-01.json | 腾讯 | 2026 | 12 | 27届暑期腾讯新闻前端面经 | https://www.nowcoder.com/discuss/867744196365475840 |
| frontend-tencent-02.json | 腾讯 | 2025 | 14 | 腾讯wxg前端面经 | https://www.nowcoder.com/discuss/851948468577841152 |
| frontend-tencent-03.json | 腾讯 |  | 14 | 腾讯2025暑期实习提前批前端开发面经（已OC） | https://www.nowcoder.com/discuss/722052922485243904 |
| frontend-zhihu-01.json | 知乎 | 2026 | 12 | 知乎前端面经 | https://www.nowcoder.com/discuss/892108187820650496 |

## test-qa（16 篇，156 题）

| 文件 | 公司 | 年份 | 题数 | 标题 | 来源 |
|---|---|---:|---:|---|---|
| test-qa-baidu-01.json | 百度 | 2026 | 10 | 百度测开一面面经 | https://www.nowcoder.com/discuss/848618666722619392 |
| test-qa-baidu-02.json | 百度 | 2026 | 13 | 27届百度测试开发一面面经 | https://www.nowcoder.com/discuss/868186445020684288 |
| test-qa-baidu-03.json | 百度 | 2026 | 5 | 百度测开二面面经 | https://www.nowcoder.com/discuss/848959500932427776 |
| test-qa-bilibili-01.json | 哔哩哔哩 | 2026 | 9 | b站测开一面面经 | https://www.nowcoder.com/discuss/848664221658120192 |
| test-qa-bytedance-01.json | 字节跳动 |  | 9 | 抖音电商测开一面 | https://www.nowcoder.com/feed/main/detail/107237e2ef014f069b487caac613e056 |
| test-qa-didi-01.json | 滴滴 | 2026 | 7 | 滴滴测开一面面经 | https://www.nowcoder.com/discuss/848592426624167936 |
| test-qa-didi-02.json | 滴滴 | 2025 | 9 | 滴滴测开面经 | https://www.nowcoder.com/discuss/727851043714850816 |
| test-qa-didi-03.json | 滴滴 | 2025 | 5 | 滴滴26届提前批测开面经 | https://www.nowcoder.com/discuss/778370907264835584 |
| test-qa-lenovo-01.json | 联想 | 2025 | 6 | 联想测开一面凉经 | https://www.nowcoder.com/discuss/795737934635814912 |
| test-qa-meituan-01.json | 美团 |  | 12 | 美团测开一面 9.26 | https://www.nowcoder.com/feed/main/detail/76a638264e2b464a895c48a06daa03fe |
| test-qa-netease-01.json | 网易 | 2025 | 16 | 网易伏羲机器人-测开实习面经 | https://www.nowcoder.com/discuss/883690384444964864 |
| test-qa-tencent-01.json | 腾讯 | 2026 | 15 | 腾讯光子工作室，测试开发日常二面 | https://www.nowcoder.com/discuss/908761946818633728 |
| test-qa-tencent-02.json | 腾讯 | 2026 | 16 | 腾讯光子工作室，测试开发三面 | https://www.nowcoder.com/discuss/908762630863454208 |
| test-qa-tencent-03.json | 腾讯 | 2026 | 10 | 腾讯光子工作室，测试开发日常一面 | https://www.nowcoder.com/discuss/908761110117908480 |
| test-qa-tencent-04.json | 腾讯 | 2026 | 5 | 腾讯测开一面面经 | https://www.nowcoder.com/discuss/864539168427302912 |
| test-qa-xiaoying-01.json | 小赢科技 | 2025 | 9 | 小赢科技 测试开发一面面经 | https://www.nowcoder.com/feed/main/detail/17c429101bf944dbab8fb087cd851fab |

## infra（16 篇，450 题）

| 文件 | 公司 | 年份 | 题数 | 标题 | 来源 |
|---|---|---:|---:|---|---|
| infra-baidu-01.json | 百度 |  | 17 | 百度sre实习面经（oc） | https://www.nowcoder.com/discuss/723877059239346176 |
| infra-baidu-02.json | 百度 |  | 8 | 百度sre一面面经 | https://www.nowcoder.com/feed/main/detail/4ffd9899c60f4f9d9a6eae0d5d1c8d31 |
| infra-baobaobashi-01.json | 宝宝巴士 |  | 19 | 宝宝巴士-运维工程师面经 | https://www.nowcoder.com/feed/main/detail/a3b91ccae5164dae87d332e6f0d8fb13 |
| infra-boke-01.json | 波克城市 |  | 28 | 波克城市-2025秋招-运维工程师面经 | https://www.nowcoder.com/discuss/792889897148248064 |
| infra-bytedance-01.json | 字节跳动 |  | 12 | 字节SRE一面 | https://www.nowcoder.com/feed/main/detail/e2a502f37ad04bbabdb760e5925a1716 |
| infra-fenzi-01.json | 分子之心 |  | 14 | 分子之心 服务运维实习 一面 | https://www.nowcoder.com/feed/main/detail/c0597d0b13c14871b50fd2d223a3b916 |
| infra-gongji-01.json | 共济科技 | 2026 | 128 | 共济科技 SRE 面经 | https://www.nowcoder.com/discuss/908367488235110400 |
| infra-guanyuan-01.json | 观远数据 | 2026 | 58 | 杭州观远数据 运维实习 面经 | https://www.nowcoder.com/discuss/908191304679456768 |
| infra-kuaishou-01.json | 快手 |  | 21 | 快手-运维暑期实习生面经 | https://www.nowcoder.com/feed/main/detail/7dbec8b42bba46e1b74dc176ff2c8a03 |
| infra-megvii-01.json | 旷视科技 | 2026 | 32 | 旷视科技系统运维实习一面面经 | https://www.nowcoder.com/feed/main/detail/e2cbe7e87106489e882b95afac2b5419 |
| infra-migu-01.json | 咪咕 |  | 12 | 咪咕运维面经 | https://www.nowcoder.com/feed/main/detail/ffaebe5f4af1469b92b6e884aa6ddb5d |
| infra-qingteng-01.json | 青藤云 |  | 18 | 青藤云运维面经 | https://www.nowcoder.com/feed/main/detail/0b99f63bd74c4a52ad17159542e890ad |
| infra-tencent-01.json | 腾讯 |  | 21 | 腾讯云智-技术运维实习面经 | https://www.nowcoder.com/feed/main/detail/ec6ec908bade410db2c81f9c8a8ecbbc |
| infra-xiaohongshu-01.json | 小红书 |  | 19 | 小红书sre实习面经（oc） | https://www.nowcoder.com/discuss/725796328210440192 |
| infra-yinshuo-01.json | 尹硕科技 |  | 32 | 深圳尹硕科技有限公司 SRE运维实习生面经 | https://www.nowcoder.com/feed/main/detail/60b857032ad44fecbd564f7844982c19 |
| infra-youka-01.json | 游卡 |  | 11 | 游卡 运维开发实习 一面： | https://www.nowcoder.com/feed/main/detail/b9bb9f7f5b15414fab13105bbe1796a9 |

## backend（16 篇，556 题）

| 文件 | 公司 | 年份 | 题数 | 标题 | 来源 |
|---|---|---:|---:|---|---|
| bytedance-04.json | 字节跳动 | 2025 | 46 | 字节后台开发面经 | https://www.nowcoder.com/feed/main/detail/d5e4b2aad5904491916597cb0084dbb1 |
| bytedance-02.json | 字节跳动 | 2026 | 37 | 字节后端一面 嗯问八股 有没有大佬评估下难度 | https://www.nowcoder.com/feed/main/detail/09cce79d77954a06bf9cc4b9665b0abf |
| tencent-06.json | 腾讯 | 2025 | 42 | 双非腾讯云智后台开发oc面经 | https://www.nowcoder.com/feed/main/detail/162323abffc24d73b7685d13c09f9d54 |
| tencent-07.json | 腾讯 | 2025 | 40 | 腾讯云智四面oc Timeline附面经 （base西安） | https://www.nowcoder.com/feed/main/detail/8f92784da7a24256bd8f4392c987b0d7 |
| netease-01.json | 网易 | 2025 | 57 | 24.9.2025网易云 | https://www.nowcoder.com/feed/main/detail/176daf4bc6094b289ef67305955fcd52 |
| pinduoduo-02.json | 拼多多 | 2026 | 54 | 拼多多一面 | https://www.nowcoder.com/feed/main/detail/5cace16dcc8e4bf29a03c93e193022fe |
| xiaohongshu-01.json | 小红书 | 2026 | 41 | 小红书 - AI后端开发 一面（约二面 | https://www.nowcoder.com/feed/main/detail/e07702037462474596f83b57f0d0ce72 |
| didi-03.json | 滴滴 | 2026 | 36 | 滴滴 AI Agent 后端面经 | https://www.nowcoder.com/feed/main/detail/17ee6ae95cc44ec19b9eefadb69da6b3 |
| meituan-01.json | 美团 | 2025 | 30 | 26届美团暑期实习后端开发一面面经（面完马上约二面） | https://www.nowcoder.com/feed/main/detail/7a197c54ad294c5496eb6146a6f740d3 |
| kuaishou-06.json | 快手 | 2026 | 30 | 快手日常实习——后端二面-已oc | https://www.nowcoder.com/feed/main/detail/baf40dc2e3fa44c0b80be7574828a603 |
| kuaishou-04.json | 快手 | 2026 | 27 | 快手后端一面 | https://www.nowcoder.com/feed/main/detail/09342be221734d2fbecf742ed05db61c |
| xiaomi-01.json | 小米 | 2025 | 27 | 小米-后端开发-二面面经 | https://www.nowcoder.com/feed/main/detail/a370aff3d2734e0283a97b1c5844f89c |
| jd-07.json | 京东 | 2025 | 25 | 京东后端oc面经（含timeline） | https://www.nowcoder.com/feed/main/detail/8e28ab8ad4b944bd82ae653a094b5aa7 |
| baidu-04.json | 百度 | 2025 | 25 | 四非本 百度后端实习(一天速通) | https://www.nowcoder.com/feed/main/detail/020e5f8f858b430ea0186be475b4122a |
| shopee-01.json | Shopee | 2025 | 25 | [XHS Source] 2025-08-17 · 68a0b118 | https://github.com/liqiangcc/interview-lab/issues/1123 |
| alibaba-01.json | 蚂蚁集团 | 2026 | 14 | 蚂蚁后端一面凉经 | https://www.nowcoder.com/feed/main/detail/1eac2e754a8d4160a47f95bbb787e3c6 |

## 已删除

后端原有 75 篇，按题数与公司多样性（每家 ≤ 2）取 16 篇，其余删除。四个岗位各 20 篇里删掉的：

- ai-llm-alibaba-02：整理帖：Java 八股加答案，不是一场面试
- ai-llm-bytedance-04：只有两条概括，没有题目
- ai-llm-renrenzu-01：流程叙述，没有题目
- ai-llm-changxin-01：带标准答案与代码的整理帖，噪声大
- frontend-huawei-01：OD 全流程记录，笔试与 HR 占大半
- frontend-xiaohongshu-01：只有 5 条，几乎全是项目闲聊
- frontend-alibaba-01：只有 4 条
- frontend-jishi-01：只有 6 条
- test-qa-other-01：高级测试主管面，几乎全是 HR 问题
- test-qa-jd-01：只有 4 条
- test-qa-bilibili-02：吐槽帖，3 条题目
- test-qa-didi-04：5 条，偏 HR
- infra-bytedance-02：问的是 transformer / RAG，与运维岗不符
- infra-leqi-01：5 条，偏离职与驻场
- infra-xiaoduo-01：叙述式复盘，没有明确题目
- infra-kuaishou-02：AI infra 知识整理帖，不是面试记录

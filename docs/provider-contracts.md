# 多服务商契约表

这个项目的模型服务商是用户在设置页自己选的（`src/lib/ai/config.ts` 里那十家），同一段代码要在 OpenAI 原生通道和一堆 OpenAI 兼容口上都跑得动。踩过的坑此前散在 `docs/interview-failures.md` 和代码注释里，换一次服务商就要重新翻一遍——这里把"服务商之间到底哪里不一样"收成一张表，加一个能当场测的探针（`npm run probe`，`scripts/provider-probe.ts`）。

表里每行一个行为维度，措辞与探针输出的措辞一致：换服务商 / 换模型先跑探针，再照结果改表，不要凭印象填。

列的口径：
- **OpenAI**：`createOpenAI` 的原生通道（`src/lib/ai/providers.ts`）。
- **DeepSeek**：走 OpenAI 兼容口，但单独一列——下面一半的坑是它露出来的，也是这个项目实测最多的服务商。
- **其它兼容口**：Qwen / Kimi / GLM / MiniMax / 豆包 / 自定义 / 本地，以及 Anthropic（这个项目也把它接在兼容口上，`baseURL` 指 `api.anthropic.com/v1`）。没实测过的写"未测"，别默认它们和 DeepSeek 一样。

| 维度 | OpenAI | DeepSeek | 其它兼容口 | 代码里在哪兜 |
|---|---|---|---|---|
| 结构化输出的 schema 随请求下发 | 下发（原生结构化输出，键名与类型由服务端约束） | 不下发（SDK 只请求"返回 JSON"，键名由模型自己挑） | 不下发（同 DeepSeek，兼容口都一样） | `schemaInstruction`（`src/lib/ai/run-agent.ts`）：非 OpenAI 把 JSON Schema 拼进系统提示词；OpenAI 返回空串 |
| 思考 token 算在输出上限里 | 算（gpt-5 系列） | 算（V4） | 算（Kimi / GLM / Qwen3 同类思考模型）；不思考的模型无所谓 | `REASONING_HEADROOM_TOKENS`：输出上限 = 调用方的正文预算 + 8000；`lowReasoningOptions` 默认压低或关掉思考 |
| JSON 模式下把工具调用写成正文 | 没见过 | 会（偶发，`<｜DSML｜ calls>` 跟在 JSON 后面） | 未测 | `parseLooseJson`：整段解析不成就取第一个配平的对象，后面跟着的文本不算坏输出 |
| 历史里 assistant 是裸文本时整回合吐空白 | 没见过 | 会（正文只剩 15–27 个空格 token，答案留在 reasoning 里） | 未测（GLM / Kimi 同样是默认思考的兼容口，属同一类风险） | `buildHistory`（`src/lib/interview/interviewer.ts`）：面试官的话按它当时的输出形状写成 `{"reply": …}`；正文只有空白算"没说出话" |
| 缓存命中 token 读哪个字段 | `usage.inputTokenDetails.cacheReadTokens`（SDK 从 `prompt_tokens_details.cached_tokens` / responses 口的 `input_tokens_details.cached_tokens` 归一化） | 同左，但服务商不报 `prompt_tokens_details` 时恒为 0（不是"没命中"，是"没报"） | 同左 | `agent-run-store.ts` 落到 `AgentRun.cachedTokens`；`pricing.ts` 按这个字段算缓存那一档的钱 |
| 工具调用走协议通道 | 走（`tool_calls`） | 多数走；JSON 模式下偶发写成正文（见上面那行） | 未测 | `agent-loop.ts` 只执行 `StepResult.toolCalls` 里的调用——写在正文里的调用不会被执行，只会被当成一段废话 |

## 每一条是怎么发现的

这一节才是这张表的资产：判定本身会过期，发现它的方法不会。每条按"现象 → 怎么定位 → 现在怎么兜 → 探针怎么复现"写。

1. **结构化输出的 schema 随请求下发**
   现象：同一个 agent 在 OpenAI 上键名 100% 对得上，换到兼容口后模型用自己想的键名，`invalid_structured_output` 成片出现。
   定位：读 `@ai-sdk/openai-compatible` 的实现——它只发 `response_format: json_object`，schema 根本没上路；OpenAI 原生走的是 json_schema。
   现在怎么兜：`schemaInstruction` 把 JSON Schema 原样拼进系统提示词。有工具时措辞要换，不能说"最终答案之外不要输出任何其它文字"——G2 冒烟里 DeepSeek 因此一次工具都没调，直接出了 JSON。
   探针：故意**不**把 schema 写进提示词，只看返回的键名对不对得上。

2. **思考 token 算在输出上限里**
   现象：备课 4/4 失败，简报 JSON 被截断（`docs/interview-failures.md`"备课两次都没备好"那行）。
   定位：记账行里 `finishReason = length`，而正文是空的或半截——输出上限被推理吃光了。这种失败从错误消息上看不出来，只能看 `AgentRun` 的 finishReason 加正文长度。
   现在怎么兜：`runAgent` 统一把输出上限设成"调用方的正文预算 + 8000 推理余量"，推理档位默认压低（判断都在代码里，模型只负责写）。
   探针：给一个小的 `maxOutputTokens`，看 `usage.outputTokenDetails.reasoningTokens` 报不报数。注意探针故意不带 `lowReasoningOptions`，要看的是服务商的默认行为。

3. **JSON 模式下把工具调用写成正文**
   现象：一场面试第 6 回合，`<｜DSML｜ calls>` 跟在正常 JSON 后面，整段被判成坏输出。
   定位：记账行的 `rawText`——坏输出一定要原样存下来，不然这种"JSON 是对的、后面多了一段"的形态永远查不出。
   现在怎么兜：松散 JSON 解析从"第一个 `{` 到最后一个 `}`"改成"整段不成就取第一个配平的对象"。
   探针：JSON 模式下给一个工具并要求它必须查，再用正则在正文里找 DSML / tool_call / function_call 这类文本。

4. **历史里 assistant 是裸文本时整回合吐空白**
   现象：DeepSeek 面试官整场只说"稍等，我整理一下"，3/3 回合没说出话。
   定位：逐段二分系统提示词，发现哪一段都能触发；换成"单条消息"或"把历史写成 JSON 形状"就正常——问题不在提示词内容，在历史消息的**形状**：模型在模仿历史里自己的裸文本格式，于是在 JSON 模式下吐出一串空格，答案留在 reasoning 里。
   现在怎么兜：历史里面试官的话写成它当时的输出形状 `{"reply": …}`；正文只有空白一律算"没说出话"；思考默认关掉。
   探针：在历史里放一条裸文本 assistant 消息，看这一回合的正文是不是只剩空白。

5. **缓存命中 token 读哪个字段**
   现象：缓存命中率是这个项目的一等指标（长系统提示词 + 十几回合复用同一前缀），但各家报的字段名不一样。
   定位：读 SDK 的 usage 映射——兼容口只认 `prompt_tokens_details.cached_tokens`，取不到就填 0，并按"输入总量 − 命中数"倒推未命中部分。
   现在怎么兜：全项目只从归一化后的 `usage.inputTokenDetails.cacheReadTokens` 读，落 `AgentRun.cachedTokens`，指标和 `pricing.ts` 的折算都基于它。看到 0 要先怀疑"服务商没报"，再怀疑"真没命中"。
   探针：打印这次调用的 `cacheReadTokens`——单次调用本来就不保证命中，判定要看记账行里连续多次的数。

6. **工具调用走协议通道**
   现象：给了工具却一次没调（`docs/interview-failures.md` 的"轨迹级失败"两行）。
   定位：记账行里每步的 `toolCalls` 计数；调用走协议通道才数得到，写进正文的不算。
   现在怎么兜：循环只执行 `StepResult.toolCalls`；该查的时候由代码在现场卡上点名"先查某个包"，不靠"拿不准时查"这种软话。
   探针：看 `result.toolCalls` 有没有东西。这一项只能证"走"，证不了"不走"——这次没调工具可能只是它不想调，所以判定写"这次没调工具（看不出）"。

## 跑探针

```
npm run probe
```

用设置页里当前配置的文本模型，四次调用（纯文本、带 schema 的结构化输出、JSON 模式 + 一个工具、历史里的裸文本 assistant），每个维度打一行，末尾按 `src/lib/ai/pricing.ts` 报这次花了多少。没配模型会说明原因后正常退出；单个探针失败只把它覆盖的维度记成"未测"，不影响其它行。

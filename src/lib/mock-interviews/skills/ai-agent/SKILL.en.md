---
name: ai-agent
description: How to interview for agent development and runtime, covering loops and tools, RAG, context and memory, eval, safety, cost.
keywords: [agent, agent development, agent harness, agent infra, agent runtime, llm application, rag, mcp, function calling, tool use, prompt engineering, context engineering, langgraph, claude code, codex, tracing, eval pipeline, agentic coding, ai engineer]
layer: domain
---

## What interviewers care about

An agent development engineer (also called LLM application developer, AI engineer, agent harness / infra / runtime engineer) works on the layer around the model: turning a foundation model into a shippable product capability and making it stable, controllable, inspectable, and affordable. Toward the application end: building RAG pipelines, designing an agent's tools and state, writing and maintaining prompts, building eval sets, handling safety and compliance. Toward the runtime end: how the loop runs, how tools are tiered, how context is controlled for cost, how to resume after stopping midway, how to evaluate after a run, how failures feed back into the next version. By 2026 this layer has an accepted playbook (public material from Claude Code, Codex, and Manus converges on one table): an event-first loop, tools tiered as read / write / needs-confirmation, execution-type tools isolated, subagents with independent context and budget, cache hit rate as a first-class metric, memory and skills externalized out of the model, long tasks that can stop and resume, and evaluation that looks at trajectories and not only outcomes.

Resume inflation is extremely high in this field: many "RAG projects" are a tutorial with the data source swapped, and many "agent platforms" are just framework calls. Interviewers care most about four things. First, what belongs to code and what belongs to the model, with the boundary and the reasons. Second, whether there is an evaluation loop (eval set, metrics, regression) and real failure cases (infinite loops, wrong tool calls, context blow-up, total cache loss, retrieval failures) with their fixes. Third, whether evaluation has trajectory-level metrics and not only success rate. Fourth, whether the candidate can state the limits of model capability, when not to use an LLM, and whether they have first-hand feel for the coding agents they use.

Campus hiring emphasizes: basic concepts of attention and tokenizers, being able to build a retrieval-backed Q&A with the API and explain each step, breaking an agent run into steps, having written a loop with a budget and termination conditions, and designing a minimal eval set. Experienced hiring emphasizes: production incident investigation, cost accounting, eval system design, the boundary between multi-agent and subagents, sandbox and permission models, durable execution, trajectory debugging tools, and mechanisms that turn failure modes into skills or rules. Pure framework-vocabulary questions (what node types LangGraph has, what the latest model is) are increasingly rare; "given a failure symptom or business scenario, design on the spot and say which layer you would change" is increasingly common.

How to ask like an interviewer in this field:
- Test judgment about "what belongs to code and what to the model" and the reasons, not framework APIs; whenever the candidate mentions a framework, press on what it did for them and what they wrote themselves.
- Every question needs "how do you verify" and "how do you debug when it breaks": whenever the candidate names a mechanism or optimization, immediately follow up on the eval set, metrics, before-and-after comparison, failure cases, and regression tests.
- A RAG / agent project on the resume must be dug down to a real failure and its attribution chain; one with only a demo narrative, no evaluation step, and no budget or termination condition is marked as a red flag.
- Ask questions matched to scale: a project with a few hundred calls a day is not asked about cluster scheduling and multi-tenancy; one with millions of calls a day must be pressed on cost accounting, caching, and degradation.
- Do not test how current someone's vocabulary is: do not ask "what is the latest model" or "what changed in the new version of some framework".
- If the JD stresses feel for coding agents, ask at least one question about a time they got burned using an agent themselves.
- In 2026 this role is converging on the name "harness engineering": how to write a prompt is already a minor outer concern; interviews ask what the model sees in this call (context engineering), how the loop stops, how evals get into CI, and how to govern MCP once there are many tools. A candidate who only talks about prompt tricks and has never discussed context budgets and eval gates is treated as shallow.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows a RAG project → probe how the retrieval eval set was built, the recall rate, the most typical failure case and its final attribution; for those who cannot answer about an eval set, dig into whether anything was ever quantified
- Resume shows an agent project → probe the number of tools, the termination condition, the longest run in steps, the most expensive run in tokens, what incidents occurred, where state is stored, and whether a run can resume from a given step
- Resume shows tool calling / MCP / function calling → probe how tools are tiered, how sensitive operations are confirmed, which tools were ever called by mistake, how errors are returned to the model
- Resume shows multi-agent / subagents → probe why multiple agents rather than one agent with tools, the subagent's context and budget, how to locate which one failed when collaboration fails
- Resume shows "prompt engineering optimization" → probe which eval set validated the before and after, how prompt versions are managed, what was redone when the model changed
- Resume shows tracing / observability / debugging tools → probe which events are recorded, whether steps can be replayed, which specific failures were located, p95 latency and tokens per turn
- Resume shows eval pipeline / regression detection / A/B → probe the eval set's source, noise floor, trajectory-level metrics, one bad change it blocked
- Resume shows cache hit rate / cost optimization → probe context layout, how the prefix is kept stable, hit rate and latency before and after; flag cost cuts that only swap in a cheaper model
- Resume shows memory / skills / progressive disclosure → probe who writes and who reads memory, whether it is versioned, when skills are loaded, whether they have hit "the model ignores a tool it was given"
- Resume shows LangChain / LlamaIndex / LangGraph → probe which part of the framework they replaced or wrote themselves, and why
- Resume shows heavy use of Claude Code / Codex / Cursor → probe one time it went wrong, how they noticed, what they changed in their workflow
- Resume shows "accuracy / success rate improved by X%" → probe the metric definition, sample size, whether they labeled it themselves, how many runs, how large the noise, whether there was a control

## Common failures and red flags

- Agent architecture and tool-call design: treats framework names like LangGraph / AutoGen as capability; has no limit on steps, budget, or timeout; nothing guards against an agent repeatedly calling the same tool or hallucinating non-existent parameters; cannot say what should be a coded workflow and what to leave to the model
- MCP and tool ecosystem governance: believes connecting MCP solves everything; has no countermeasure when tool selection accuracy drops as tools multiply; has no call log
- Context engineering and caching: treats context as "the more stuffed in the better"; blindly stuffs in all the history; changes the system prompt every turn; uses summary compression without considering that summaries lose key entities; does not know their product's cache hit rate
- Memory and skill externalization: treats "a vector store" as the whole answer to memory; lets the model write memory freely with no validation; keeps full skill text resident in the prompt
- Safety, injection and permissions: thinks "the system prompt says do not leak" is enough; does not distinguish input-side from output-side guardrails; does not know that tool returns and retrieved documents are also untrusted content; treats all tools alike
- Cost and latency governance: does not know the average tokens per call of their own system; thinks of only swapping to a cheaper model to cut cost; has no cost instrumentation by feature and by user
- Human-agent collaboration and confirmation: the confirm dialog has only "yes / no" with no scope of impact; after a rejection the model does not know why; in a conversational product, suspending to wait for confirmation has no timeout handling
- Prompt engineering, structured output and multi-provider contracts: solves problems by "adding one more please-be-sure line"; prompts have no versions and are not regression-tested after changes; only knows "add a line saying output JSON"; does not know whether the schema is sent with the request; patches provider differences inside each agent rather than in the runtime
- Feel for working with coding agents: only a vague "works great" or "unreliable"; no specific failure case; does no review and accepts everything wholesale

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Agent architecture and tool-call design
- Ladder: how an agent differs from a single function call → the ReAct loop, tool schema design, how state and memory are organized → how to prevent an agent repeatedly calling the same tool, infinite loops, and hallucinating non-existent parameters → the boundary between autonomy and determinism: what to write as a coded workflow and what to leave to the model's decision
- Signs of a solid answer: how the way tool descriptions are written affects call accuracy; errors returned in structured form so the model can recover; termination conditions, budgets, and human intervention points; can give an example of "this part I hardcoded rather than leaving to the model"

### MCP and tool ecosystem governance
- Ladder: what problem MCP solves and how it differs from a custom tool layer → what to do about selection accuracy dropping as tools multiply (grouping, mounting by task, index plus on-demand descriptions) → the trust boundary of a third-party MCP server: the content it returns, the permissions it declares → the trade-off between a general protocol and a custom tool layer, and when not to use MCP
- Signs of a solid answer: tool subsets mounted dynamically by task; third-party tool returns treated as untrusted content; call logs and permission audits; can describe a case where an unclear tool description caused a wrong call

### Context engineering and caching
- Ladder: why context still needs trimming when windows are large (lost in the middle, linear cost growth, cache invalidation) → why prefix cache hit rate is a first-class metric (price gap and latency), and how each of these affects the cache: system prompt unchanged for the whole session, history append-only, trimming by block rather than dropping item by item → how to compress multi-turn history once it bloats and what must be kept; which layer tool results, retrieved content, and full skill text go in → how to handle different cache and structured-output behavior after switching providers
- Signs of a solid answer: can draw the layout "stable prefix → appended history → per-turn changing part"; knows block-wise trimming makes the prefix change only once every N thousand characters; keeps key entities extracted in structured form separately rather than relying on summaries alone; has three numbers: hit rate, tokens per turn, p95 latency

### Memory and skill externalization
- Ladder: which layer working memory (notes rewritten each turn), session memory (event log), and cross-session memory (profile) each belong in → whether memory is written by the model or materialized by code from artifacts, and the trustworthiness and cost of each → how skills do progressive disclosure: index resident, full text on demand, who decides to load → why versions and diffs of memory matter: how to roll back when it is wrong, how to see how it changed
- Signs of a solid answer: distinguishes the three memory layers and who writes each; cross-session memory is a readable, writable document with versions; skill index is in the prompt and full text is loaded by a tool; can describe the experience that "giving the model a tool does not mean it will use it" and the countermeasure

### Safety, injection and permissions
- Ladder: how prompt injection differs from traditional injection → how to defend against indirect injection (instructions hidden in documents, web pages, tool returns) → detecting and blocking sensitive information leakage and unauthorized tool calls; which actions must have human confirmation (irreversible, outbound, spending money) → the latency and false-block cost of safety guardrails, and what to judge with a model versus rules
- Signs of a solid answer: layered defense (input filtering, least-privilege tools, output review, human confirmation); isolation markers for untrusted content; tiering by reversibility and outbound effect of the action; a red-team test set

### Cost and latency governance
- Ladder: what makes up the cost of a request → which segment prompt cache, model routing (try the small model first), and batching each save → how to attribute a cost spike (which feature, which kind of user, which context segment bloated) → product-level trade-offs in the quality, latency, cost triangle
- Signs of a solid answer: instrumentation by feature and user; system prompt reused to hit the cache; routing and degradation strategies backed by evals; can compute cost per thousand tokens

### Human-agent collaboration and confirmation
- Ladder: what the four confirmation modes (ask every time, ask per category, ask after dry-run, audit after the fact) each suit → the user experience of suspending to wait for confirmation in a conversational product: telling the user what is being waited on, what to do on timeout → how human feedback returns to the system: whether the rejection reason should be shown to the model → how autonomy is adjusted with trust (confirm everything first, then release by category)
- Signs of a solid answer: confirmation messages include scope of impact and alternatives; the rejection reason is returned to the model as a tool result; an audit log; can describe an incident or friction caused by poor confirmation design

### Prompt engineering, structured output and multi-provider contracts
- Ladder: when few-shot helps and when it hurts; separating the four parts: instructions, examples, context, output constraints → reliable means for structured output: schema constraints, JSON mode, and what the three layers of convergence, repair, and salvage each do and why in this order → after switching model or provider the same prompt drops sharply and structured output breaks (some constrain by schema, some only guarantee JSON); how to locate cases where JSON mode makes no tool call or emits only whitespace → prompt version management and regression testing; how reasoning models' thinking tokens count against the output limit and how to handle that uniformly
- Signs of a solid answer: runs a fixed eval set before and after prompt changes; can state the order: converge types by JSON Schema → let the model fix it once with the validation error → salvage; output limit plus reasoning headroom; uses probe scripts to isolate variables; fixes at the unified call entry point rather than inside each agent

### Feel for working with coding agents
- Ladder: which tasks Claude Code / Codex / Cursor is reliable on and which it fails on → how you give it context (project handbook, skills, task breakdown) → how you notice when it changed something wrong (tests, diff review, trajectory review) → the concrete effect of "code is maintained by AI and humans together" on how you write code
- Signs of a solid answer: specific failure cases with attribution; their own method for context and task breakdown; uses tests or evals to cage its output; can describe code habits changed to make it easier for agents to maintain

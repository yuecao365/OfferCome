---
name: agent-runtime
description: Agent runtime deep dive on loops and events, tool protocol and sandboxing, subagents, budgets, recovery, output contracts.
keywords: [agent runtime, harness, agent loop, event sourcing, tool permissions, sandbox, subagent, durable execution, checkpoint, structured output, tool_choice, trace]
layer: detail
domains: [ai-agent, ai-infra]
---

## What interviewers care about

This pack is the runtime layer of ai-agent: how to write the code that wraps the model. The interviewer is not looking for framework names but for the judgment a candidate has left behind after writing or modifying a loop themselves: where state lives, what happens when a budget is exceeded, how a tool error goes back to the model, how to resume after stopping halfway, and why structured output breaks when you switch providers. The way to probe is to give a failure symptom and have the candidate locate the layer: is an infinite loop a termination-condition problem or a tool-result problem; did the context blow up because history was never trimmed or because tool results were too long; is an inconsistent replay caused by state stored twice or by events missing fields. A candidate who can line up what Claude Code, Codex, Manus and similar public material do with their own trade-offs is giving a solid answer.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows a self-built agent loop / runtime → probe how a step is defined, where state lives, what happens when the budget is exceeded, whether a run can resume from a given step, the longest run in steps, and the tokens and cache hits per step
- Resume shows tool permissions / sandboxing → probe how many tiers, who approves, what was ever called by mistake, what boundaries isolate execution-type tools, how timeouts are handled
- Resume shows multi-agent / subagents → probe why the split, the subagent's context and budget, how output returns to the main flow, how a collaboration failure is localized
- Resume shows checkpoint / resume from breakpoint → probe what is saved, what must not be re-run, idempotency keys for write operations, one real recovery
- Resume shows trace / replay / debugging tools → probe which events are recorded, how step-by-step replay works, which failures it helped locate
- Resume shows multiple providers / structured output → probe which provider broke, at which layer the fix went, and the order of convergence and salvage

## Common failures and red flags

- Runtime loop and state: hands the whole loop to the framework's maxIterations and cannot say what happens after the limit; stores state in both the message list and events and the two disagree
- Tool protocol, permission tiers and sandboxing: more tools means stronger; sensitive tools have no confirmation or dry-run; feeds stack traces straight back to the model on tool errors; sandbox answer is just "use Docker"
- Subagents and orchestration: uses multiple agents for the sake of "multi"; subagent and main agent share one endlessly growing context; cannot say whose trajectory to look at when collaboration fails
- Interruption recovery and persistence: says "just re-run it"; conflates retry with resume; does not know write operations need idempotency keys
- Event log and trajectory observability: records only the final output, not the steps; the trace has no per-step tokens, cache, or latency; locates failures by re-running
- Budgets and termination conditions: only a step limit; throws an error at the user when the budget is exceeded; never considered giving the model a final step with "no tool calls, conclude directly"
- Structured output contract and multiple providers: only knows "add a line saying please output JSON"; does not know whether the schema is sent with the request; patches provider differences inside each agent
- Streaming output and multi-step loops: mixes streaming and multi-step so it is unclear which step's text went to the user; with streaming, confirmation tools cannot suspend and there is no alternative

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Runtime loop and state
- Ladder: what segments make up one agent run (gather context → call model → execute tools → observe → call again) → where loop state lives, and why "the event log is the single source of truth, everything else is a projection" beats storing the message list directly → when a budget (steps, tokens, time, cost) is exceeded, whether to throw an error or give the model one step to conclude, and the user-experience impact of each → the conflict between streaming output and owning the loop yourself: once the first step starts emitting text, can the loop still control itself
- Signs of a solid answer: can describe the event → message projection; when the budget is exceeded, writes the event first and then gives one "no tool calls, conclude directly" step; knows what the SDK's stopWhen and a hand-written loop can each control; can describe a real use of "replay is recovery"

### Tool protocol, permission tiers and sandboxing
- Ladder: how to write tool descriptions and input schemas so the model picks wrong less often → how the read / write / needs-confirmation tiers each execute and what the audit records → why execution-type tools (running code, editing files, sending requests) need isolation, the three isolation boundaries (process, filesystem, network) and timeouts → how confirmation works in a streaming conversation: suspending to wait for confirmation versus the trade-off of "this turn cannot wait"
- Signs of a solid answer: mounts a tool subset dynamically by task; write operations force confirmation or dry-run and have a call log that can be replayed; knows that an unknown tool, an execution exception, and a hook rejection should all become "failed tool results" rather than crashing the loop

### Subagents and orchestration
- Ladder: when a subagent is needed (independent context, independent budget, independent permissions) and when a single agent with tools is enough → how a subagent's output returns to the main flow (write events only / pass back a summary / shared files) → when a multi-agent collaboration fails, how to locate which one went wrong → three control philosophies of orchestration: model-driven, code-driven, explicit handoff, and what tasks each suits
- Signs of a solid answer: the reason for splitting rests on context and budget; subagents have read-only tools and write only events; there is a per-session / per-task step cap; can give an example of "why the critic's opinion does not go into the main agent's input"

### Interruption recovery and persistence
- Ladder: why long tasks must be able to stop and resume (timeouts, deployments, human confirmation) → what a checkpoint stores: message list vs event log vs external snapshot → on resume, what must not be re-run (write operations already executed) and what must be re-run (tool calls with no result) → idempotency: the same user message submitted twice, the same turn number persisted only once
- Signs of a solid answer: rebuilds state by replaying events; re-runs only calls that have no result; write operations carry idempotency keys or log "about to do" before "done"; can describe how client-id deduplication is actually done

### Event log and trajectory observability
- Ladder: which events a run must record (model calls, tool calls and results, rollbacks, budgets, suspensions) → how events project into messages, state, and metrics → how to localize a failure in the trace to a step: whose input made the model pick the wrong tool, at which step the context suddenly grew → retention, redaction, and cost of trajectory data; how much to record per step to be replayable without blowing up storage
- Signs of a solid answer: can draw the event → projection relationship; every step has four numbers: token, cache hit, latency, cost; can describe a failure whose root cause was located via the trace; knows the trade-off between recording raw text and recording summaries

### Budgets and termination conditions
- Ladder: why every loop needs four kinds of budget: steps, tokens, time, cost → three ways to handle an exceeded budget (throw an error, give the model one step to conclude, degrade to a cheaper path) and the user-experience impact of each → how to prevent infinite loops: repeated-call detection, same-argument deduplication, a "no new information" signal in tool results → how budgets are set by task type and user tier, and how to treat the over-budget rate as a metric
- Signs of a solid answer: can state the default value and rationale for all four budgets; has repeated-call detection; writes the event before wrapping up when over budget; can describe the relationship between budget-hit rate and task success rate

### Structured output contract and multiple providers
- Ladder: why structured output breaks when you switch providers (some constrain by schema, some only guarantee JSON, some do not support specifying a tool) → what the three layers of convergence, repair, and salvage each do, and why in this order → how reasoning models' thinking tokens count against the output limit and how to handle that uniformly; how to locate cases where JSON mode makes no tool call or emits only whitespace → the difference between putting the contract on tool arguments (the model must call a given tool) and on the final object, and what each suits
- Signs of a solid answer: can state the order: converge types by JSON Schema → let the model fix it once with the validation error → salvage; output limit plus reasoning headroom; uses probe scripts to isolate provider differences; fixes at the unified call entry point rather than inside each agent

### Streaming output and multi-step loops
- Ladder: the user wants text as it is produced while the loop needs multiple tool-calling steps, and why the two conflict → if the first step already emits text, can the loop still decide to call a tool again; what to do with tools that need confirmation while streaming → trade-offs among non-streaming turn plus frontend typewriter, streaming only the last step, and streaming events rather than text → how streaming affects structured output and caching
- Signs of a solid answer: can say which approach their own product chose and why; knows the alternative for confirm-type tools while streaming (reject within the turn, ask again next turn); has two numbers: time to first token and whole-turn latency

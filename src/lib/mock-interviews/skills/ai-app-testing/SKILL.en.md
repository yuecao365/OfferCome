---
name: ai-app-testing
description: AI app testing deep dive on nondeterministic output, hallucination and RAG eval, agent trace audit, red teaming, regression gates.
keywords: [ai testing, llm application testing, nondeterminism, hallucination detection, rag evaluation, agent testing, decision trace, adversarial security, red team, regression gate, eval pipeline, ai-generated test cases, intent-driven testing, mcp testing]
layer: detail
domains: [test-qa, ai-agent]
---

## What interviewers care about

This pack covers the new dividing line for test development in 2026: the thing under test is an LLM application or agent, whose output is nondeterministic, whose errors do not raise errors, and whose behavior shifts with context. The interviewer wants the candidate to explain how to define "correct" for nondeterministic output, how to test hallucination and retrieval quality, how to audit an agent's decision trace, how to run adversarial security tests, and how to turn all of these into regression gates in the pipeline. The interviewer will also ask how the candidate uses AI to generate test cases, does intent-driven testing, and tests MCP tools. The deep dive on evaluation methodology is in the llm-eval pack; this pack is the testing-role view of putting it into practice.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows LLM application testing → probe how "correct" was defined, where the eval set came from, how large it is, how the pass rate is computed, how nondeterminism is handled
- Resume shows hallucination / RAG evaluation → probe how hallucination is judged, how retrieval recall is measured, which layer failure cases were attributed to
- Resume shows agent testing → probe which tool-call paths were tested, how the decision trace is audited, how infinite loops and privilege overreach were found
- Resume shows security testing / red teaming → probe where the attack set came from, coverage of injection paths, block rate and false-block rate
- Resume shows eval pipeline / regression gate → probe gate metrics and thresholds, what it has blocked, how many false blocks, how long and how expensive one run is
- Resume shows AI-generated cases / intent-driven testing → probe how generated cases are verified, what they covered that humans did not, the false-positive rate
- Resume shows MCP / skill engineering → probe how tool schemas are tested, how permissions are verified, how it differs from ordinary API testing

## Common failures and red flags

- Testing nondeterministic output: still uses exact match; does not know about multiple sampling and thresholds; ignores occasional failures as flaky
- Hallucination and RAG evaluation: judges hallucination by human eyeballing; cannot tell retrieval failure from generation failure; has no retrieval eval set
- Agent trace audit: tests only the final result; does not look at the tool-call sequence; cannot target infinite loops or privilege overreach
- Adversarial security testing: tests only normal inputs; treats "the system prompt says not to" as protection; has no indirect-injection cases
- Regression gates and eval pipeline: does not regression-test after changes; the gate is only a human looking; does not know the cost of one run
- Using AI for testing: uses generated cases without verifying them; does not know the false-positive rate of generated cases; intent-driven is just a slogan
- Testing MCP and tools: tests tools like ordinary APIs; does not test permissions and error return; does not test how descriptions affect the model's selection
- Dataset and labeling governance: the eval set has no versions; labeling agreement was never measured; the test data contains production private data

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Testing in the AI era
- Ladder: what LLMs can do for testing (case generation, script generation, log analysis, defect clustering) → how to evaluate the quality of generated cases and keep hallucinated cases out of the case library → testing an AI product itself: how to assert on nondeterministic output, how to build the eval set, how to fall back when an agent call fails → the division of labor between humans and AI in testing, and which steps cannot be left to the model
- Signs of a solid answer: has a review and deduplication mechanism for generated cases; knows to use LLM-as-judge with human calibration; has a verification checklist with layered fallbacks (call, reasoning, model, consumption).

### Testing nondeterministic output
- Ladder: why exact match does not work → what semantic similarity, rule assertions, LLM grading, and multi-sample pass rate each suit → how to set the pass-rate threshold and how to tell occasional failures that are real problems from noise → balancing test cost (every call costs money) against coverage; whether temperature and seed can be fixed
- Signs of a solid answer: has trade-offs among multiple assertion styles; has a pass rate and a noise floor; knows how to sample under a cost constraint

### Testing hallucination and RAG quality
- Ladder: how hallucination is defined and judged (faithfulness, factuality) → test the retrieval layer separately: query-to-correct-document pairs, recall; test the generation layer separately: faithfulness to the context → how a wrong answer is attributed to parsing, retrieval, or generation → how the eval set is maintained as the knowledge base updates
- Signs of a solid answer: has layered test methods and metrics; has an attribution process; the eval set has a maintenance mechanism

### Agent decision-trace audit
- Ladder: why agents need process tested and not only results → how to record and assert the tool-call sequence, arguments, rollbacks, and budget hits → how to construct cases for infinite loops, unauthorized calls, hallucinated arguments, and ignored confirmations → putting trajectory-level metrics into the gate; how to build a simulated adversary and a sandbox environment
- Signs of a solid answer: can assert on the tool-call sequence; has cases for privilege overreach and infinite loops; has trajectory metrics

### Adversarial security and compliance testing
- Ladder: how prompt injection differs from traditional injection → how to construct cases for direct injection, indirect injection (documents, tool returns), privilege overreach, and sensitive information leakage → where the attack set comes from and how it is updated; how to balance block rate and false-block rate → the test points and evidence retention for compliance (privacy, content safety)
- Signs of a solid answer: the attack set covers indirect injection; has numbers for both rates; compliance testing has evidence retention

### Regression gates and eval pipeline
- Ladder: how evals get into CI: when they run, how much, how long, how expensive → how gate metrics and thresholds are set; tiered gates (fast smoke vs full) → how to attribute a case where offline passes but online breaks; how online sampled human review feeds back into the eval set → the cost of gate false blocks and misses, and who can override
- Signs of a solid answer: has gates and thresholds; has a case of blocking a bad change; has a feedback path between offline and online

### Using AI for testing
- Ladder: what AI-generated cases, intent-driven testing, and self-healing locators each solve → how generated cases are verified (validity, incremental coverage, false-positive rate) → which tests should go to AI and which must be written by humans; the boundary and review of AI testing agents → how the testing process and the division of labor with people change after adopting AI
- Signs of a solid answer: has verification of generated cases and a false-positive rate; knows the boundary of AI testing; can describe the process changes

### Testing MCP and tools
- Ladder: how MCP tool testing differs from ordinary API testing: will the model choose correctly, will it fill in arguments wrongly → how to test tool schemas and descriptions (model selection accuracy), permissions and confirmation, and error return → regression of existing agents when the tool set changes → trust and isolation testing for third-party MCP servers
- Signs of a solid answer: has measured tool selection accuracy; has cases for permissions and error return; has regression for tool changes

### Eval datasets and labeling governance
- Ladder: where the eval set comes from (feedback from production, construction, generation) and how privacy is removed → how labeling agreement is measured and how grading rules are written → how eval-set versions map to versions under test; how contamination is prevented → the maintenance cost of datasets and who owns them
- Signs of a solid answer: the eval set has versions and an owner; labeling agreement has a number; privacy removal has a process

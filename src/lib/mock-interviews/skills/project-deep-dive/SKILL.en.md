---
name: project-deep-dive
description: Probing method for projects and internships covering ownership, decisions, number provenance, postmortems. Read every session.
keywords: [project experience, internship experience, project deep dive, resume follow-up, technology selection, quantified results, postmortem, hardest problem, thesis, open source, project, internship, deep dive, intern]
layer: base
---

## What interviewers care about

Project questions are not specific to any one role; they are the main thread of every technical interview. The interviewer assumes by default that a resume is padded, and the purpose of probing is to tell apart "built it independently", "took part in it" and "heard about it". At a top internet company, a first-round interview typically spends 20 to 30 minutes digging into one or two projects; the second round and cross-team interviews come at it from a different angle to see whether the two answers are consistent. Foreign companies lean toward letting the candidate do the talking, then asking about every "I did X" with "how exactly did you do it, why that way, and how did you quantify the result".

For campus-hire candidates, projects are mostly course projects, theses, internship modules and open-source contributions. The interviewer does not expect a complex architecture; what matters is whether the candidate truly understands why every line they wrote exists and can explain boundary conditions and failures. For experienced hires, projects must match the scale of the business, and the interviewer checks whether the numbers are plausible against their own experience (QPS, data volume, machine count, latency); numbers that do not add up get pressed until the story collapses.

Interviewers care about three things above all. First, whether the candidate's personal contribution boundary is clear, and whether "we" and "I" can be separated. Second, whether technical decisions had reasons or simply followed a tutorial, and whether alternatives were considered. Third, whether results can be quantified, where the numbers came from, and whether the postmortem went deeper than "be more careful next time".

How to ask like an interviewer in this field:
- A project question is the start of a follow-up chain, not an isolated question: leave at least two levels of depth below each question, and the more smoothly the candidate answers, the more you should switch angle.
- Enter through a specific angle; do not ask open questions such as "tell me about the project". Test authenticity with three yardsticks: numbers, alternatives, and failure stories.
- Follow-ups must match the scale of the candidate's project: for a campus course project, ask for decision rationale and depth of understanding and do not demand high availability; for an experienced hire's business project, it must match the scale and include incident experience.
- When you spot a contradiction, point it out directly and give the candidate a chance to explain; what is being assessed is candor and the ability to correct course, not making the candidate uncomfortable.

## Probing projects and internships

- Resume says "responsible for", "led", "core" → probe the personal contribution boundary: break it into subtasks and ask, one by one, which parts they wrote from scratch.
- Resume shows a percentage or multiple (improved X%, reduced Y times) → probe the metric definition, how the baseline was measured, sample size, and environment differences.
- Resume shows "high concurrency" or "massive data" → probe concrete numbers (QPS, data volume, machine count) and cross-check that they are plausible.
- Resume shows "optimization" or "refactoring" → probe how the bottleneck was located before the optimization and why it was not something else.
- Resume shows "distributed", "microservices" or "cluster" → probe the deployment shape, node count, and behavior during failures, to verify it is truly distributed and not a single machine.
- Resume shows internship experience → probe the mentor, team size, code review process, whether the work shipped, and post-launch data.
- Resume shows a thesis or paper reproduction → probe the gap from the original results, where the dataset came from, and which parts they changed themselves.
- Resume shows open-source contributions → probe what is in the PR links, maintainer feedback, and why PRs were sent back.

## Common failures and red flags

- Responsibility boundary and personal contribution: narrates everything with "we"; vague when asked about a specific function or file name; the described contribution does not fit the project timeline or code volume.
- Technology selection and decision reconstruction: the answers are only "because it is mainstream", "the tutorial used it", "my mentor decided"; cannot name the rejected alternative; treats the framework name as the reason itself.
- Number and metric provenance: cannot say how the metric is defined (mixes averages and percentiles); the number is estimated or "heard from a colleague"; gives inconsistent numbers across two interview rounds.
- The hardest problem and how it was solved: the so-called difficulty is just "it took time to learn a new framework"; the root cause stops at "changed a config and it worked"; no account of wrong turns (a real investigation always has wrong turns).
- Failures, incidents and postmortems: claims the project never had problems; the postmortem is only "be more careful next time"; blames incidents entirely on others or the environment.
- What happens when conditions change (stress hypotheticals): answers "add machines" or "go distributed" without saying where the bottleneck is; has no intuition for their own system's bottleneck; answers every question with the same "add a cache".
- Verification and testing: only clicks through by hand; treats "it runs" as passing tests; does not know the boundary conditions of their own project.
- Global understanding and upstream/downstream dependencies: can only talk about their own module and knows nothing about upstream and downstream; cannot say where data is stored or in what format; the architecture description contradicts the tech stack.
- Authenticity of internship experience: cannot name the mentor or team size; every requirement "shipped and worked great" with no data; does not know the company's coding standards or release process.
- Course projects, theses and open-source contributions: the project is identical to an online tutorial and the candidate cannot say what they changed; the result is a single number with no variance; an open-source contribution is only a docs or formatting fix written up as "core contributor".
- Learning and technology transfer: every technology was "learned from the official docs" with no pitfalls to mention; the learning path does not fit the project timeline.
- Consistency cross-checks: numbers keep changing as you probe; the explanation of a contradiction is a newly invented story; gets emotional or evasive once it is pointed out.

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for how deep a solid answer goes; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Responsibility boundary and personal contribution
- Ladder: which parts of this module did you write yourself and which are someone else's → how were the interfaces between your part and upstream/downstream agreed → when you are away, can someone else take over, and who wrote the handover documents or comments → why did the team assign this to you and not someone else
- Signs of a solid answer: can describe their own part clearly in the first person; volunteers which parts they did not do; can describe the interface agreements with collaborators and how they were worked out.

### Technology selection and decision reconstruction
- Ladder: why this framework/middleware → what else was compared at the time, and the drawbacks of each → what risk worried you most at selection, and did it happen → if budget/staffing/time were different, would you choose differently
- Signs of a solid answer: can name at least one alternative and why it was dropped; distinguishes "the best choice then" from "the best choice looking back now"; knows who made the call and on what basis.

### Number and metric provenance
- Ladder: what metric is the "40% improvement" on the resume → how was the baseline measured, and how does the test environment differ from production → does the data fluctuate, and how were other factors ruled out → what does this improvement mean for the business, and was it worth doing
- Signs of a solid answer: can state the measurement method and tool; volunteers the difference between test and production environments; knows the sources of noise in the number; can translate a technical metric into business value.

### The hardest problem and how it was solved
- Ladder: what was the hardest point in the project → where did the difficulty lie: technical, coordination, or diagnosis → in what order was it investigated and what wrong turns were taken → how would you shorten the investigation if it happened again
- Signs of a solid answer: separates symptom from root cause; shows a hypothesize-and-verify process; can say what tools or information were missing at the time; has a reusable debugging methodology.

### Failures, incidents and postmortems
- Ladder: did the project ever have a production issue or a delay → what were the blast radius and the handling timeline at the time → was the root cause attributed to people, process, or system, and what were the improvements → were the improvements later verified to work
- Signs of a solid answer: has a concrete timeline and impact scope; postmortem actions are at the mechanism level (monitoring, canary release, rollback, test cases); can reflect on their own responsibility in it.

### What happens when conditions change (stress hypotheticals)
- Ladder: if traffic or data volume grows tenfold, what breaks first → why there, and on what evidence → what do you change first and why that first → at a hundredfold, is it still the same path, and when must it be redesigned
- Signs of a solid answer: locates the bottleneck before discussing solutions; can estimate orders of magnitude (memory, disk, QPS); knows the implicit assumptions of the current design; can distinguish a small change from a refactor.

### Verification and testing
- Ladder: how do you know the feature you wrote is correct → what do unit tests, integration tests and canary release each cover → were there problems the tests missed and production found → how do you balance testing investment against delivery speed
- Signs of a solid answer: can state the test layers and the purpose of each; has concrete boundary cases; knows the blind spots of the tests and has remedies.

### Global understanding and upstream/downstream dependencies
- Ladder: describe the overall architecture and data flow of the project → who does your module depend on and who depends on it → how does your module behave when an upstream changes or a downstream fails → if you redrew the module boundaries, how would you draw them
- Signs of a solid answer: can draw a clear data flow; knows the failure modes of the dependencies; understands their module's role and trade-offs within the whole.

### Authenticity of internship experience
- Ladder: how long was the internship, who was the mentor, what was the daily rhythm → did the requirements you worked on ship, and who were the users → how did code review work, and what was sent back → what was left behind at the end of the internship, was there a conversion evaluation
- Signs of a solid answer: can describe a real development process (requirement review, CR, canary); knows what became of the code they wrote; has specific issues that were pointed out to them.

### Course projects, theses and open-source contributions
- Ladder: was the topic set by the teacher or chosen by you, and what was the goal → implementation details of the core algorithm or module → where did the dataset/test cases come from, and are the results credible → if this had to become a usable product, what is missing
- Signs of a solid answer: can explain the parts they changed and why; has a self-assessment of how credible the results are; for open-source contributions, can describe the PR discussion and the maintainers' feedback.

### Learning and technology transfer
- Ladder: how did you learn the technology you used for the first time in the project → how deep did you get, and which parts were copied → what pitfalls did you hit and how did you solve them → if you switched to a similar technology, what would you look at first
- Signs of a solid answer: has concrete pitfall experiences; knows the limits of their own depth; has a transferable way of learning.

### Consistency cross-checks
- Ladder: re-ask the same thing from a different angle → have the candidate estimate numbers related to earlier answers → press on a detail to see whether it contradicts the earlier account → point out the contradiction directly and ask the candidate to explain
- Signs of a solid answer: numbers are consistent or the differences can be explained; corrects candidly when a contradiction is pointed out; volunteers background that was not made clear earlier.

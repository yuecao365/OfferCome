<div align="center">

<h1><img src="docs/images/offercome-logo.png" alt="OfferCome" width="320"></h1>

**An open-source, local-first mock interviewer that follows your answer down — and hands you a scorecard where every judgement points at your own words.**

[简体中文](README_CN.md) · [Product Site](https://offercome.yuecao.dev) · [Try in Browser](https://offercome.yuecao.dev/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-42%20SKILL.md-8A63D2?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

## What it does

Paste a job description, pick a resume, start. The interviewer prepares its own agenda from the JD and your projects, follows each answer with a probe, switches when a topic is exhausted, and closes when there is nothing left to verify. Afterwards a separate scoring agent writes the report: where you lost ground and what to practise, what held up, whether the claims on your resume survived questioning, and why the interviewer asked what it asked.

An excerpt from a real session (company and candidate anonymised; the interviewer's lines are verbatim):

> **You said:** Numerator: mean prompt tokens per turn under layered compression; denominator: the mean with full history concatenated. Twenty-odd test sessions. The gap: I only measured length, not task success.
>
> **It asked next:** You volunteered that you never compared task success — good. Different direction: a prompt change moves your offline success rate up 3 points. What do you do first to tell real gain from noise?
>
> *Why it asked:* the length metric is settled; move to evaluation method and look for noise and decision criteria.

Around the interviewer there is a small job-search workspace: interview records and review, a capability profile built from your answers, a resume centre, and application tracking.

## Quick Start

**In the browser.** Open [OfferCome](https://offercome.yuecao.dev/homepage), add a resume and connect your own model. Everything stays in your browser; the server stores nothing. Boss Zhipin sync, voice answers and interview imports need the local build.

**Docker.**

```bash
git clone https://github.com/yuecao365/OfferCome.git
cd OfferCome
docker compose up -d --build
```

**From source** (Node.js 22+):

```bash
git clone https://github.com/yuecao365/OfferCome.git
cd OfferCome
cp .env.example .env.local
npm ci && npm run db:push && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and add a model provider under **Settings**. Storage, Boss sync and hosting details: [deployment guide](docs/deployment.md).

## Features

| | |
| --- | --- |
| **AI mock interviews** | Agenda from the JD and your projects; probes, switches and closes on its own; report with score, weaknesses and practice, resume-claim checks, and the interviewer's reasoning. Voice answers locally. |
| **Interview history** | Record interviews, or import recordings, transcripts and notes locally. Upcoming interviews get a preparation page. |
| **Review** | Similar questions from real and mock interviews grouped together, with your previous answers. |
| **Capability profile** | Strengths and gaps per job dimension, each backed by excerpts from your answers. |
| **Resumes** | Internships and projects extracted from PDF, Word or image resumes, editable, used as interview material. |
| **Applications** | Import Boss Zhipin records or add applications by hand; track stages. Sync only reads; it never applies or messages for you. |

## Preview

Fictional data from a local deployment.

<table>
  <tr>
    <td width="50%" align="center" valign="top"><strong>Capability Profile</strong><br><img src="docs/images/ability-profile.png" alt="OfferCome capability profile"></td>
    <td width="50%" align="center" valign="top"><strong>Interview Review</strong><br><img src="docs/images/interview-review.png" alt="OfferCome interview review"></td>
  </tr>
</table>

<details>
<summary>More screenshots</summary>

<table>
  <tr>
    <td width="50%" align="center" valign="top"><strong>Dashboard</strong><br><img src="docs/images/dashboard.png" alt="OfferCome dashboard"></td>
    <td width="50%" align="center" valign="top"><strong>Applications</strong><br><img src="docs/images/applications.png" alt="OfferCome applications"></td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top"><strong>Interview History</strong><br><img src="docs/images/interview-history.png" alt="OfferCome interview history"></td>
    <td width="50%" align="center" valign="top"></td>
  </tr>
</table>

</details>

## Under the Hood

- **Moves before words.** Each turn the interviewer first commits to a structured move (probe / switch / clarify / end, plus a target), then writes the line. Code checks the move against the session state and sends an illegal one back; a second failure is decided by code. Prompt injection cannot redirect the interview.
- **Event-sourced sessions.** A session is an append-only event log; progress, the state card the model sees and the scoring segments are all computed from it. Any turn can be replayed against a prompt change.
- **Memory the agent writes itself.** In-session notes (to verify / concluded / doubtful / next) decide when the interview ends — no clock, no turn quota. A cross-session record keeps what each interview verified and which weaknesses recur. Scores accumulate into the capability profile.
- **One runtime for every agent.** Three-stage output contract (schema → retry with the validation error → fallback parse), three tool permission tiers, four budgets, prompts laid out for prefix caching. 1,636 real calls: 78.6% first-try pass, 97.0% usable after degradation. [Runtime](src/lib/ai/run-agent.ts).
- **Scoring is a different agent on a different model.** It can look up the resume to check numbers; every quote must be verbatim.
- **42 Agent Skills as method books, not question banks**, loaded on demand. [Packs](src/lib/mock-interviews/skills).
- **InterviewBench.** Any interviewer — a bare model, a fixed script, this system — submitted through one interface and graded only from the transcript and scorecard. Against the same model with a single prompt: 0.10 vs 0.53 unverifiable quotes per session, one question per turn 76% vs 35%; level judgement is not better than the baseline. [Bench](eval/bench/README.md).

## License

[MIT](LICENSE). © 2026 yuecao365.

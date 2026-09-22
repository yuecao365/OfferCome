<div align="center">

<h1><img src="docs/images/offercome-logo.png" alt="OfferCome" width="320"></h1>

**An open-source, local-first mock interviewer that follows your answer down — and hands you a scorecard where every judgement points at your own words.**

[简体中文](README_CN.md) · [Product Site](https://offercome.yuecao.dev) · [Try in Browser](https://offercome.yuecao.dev/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-42%20SKILL.md-8A63D2?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

[How it questions](#how-it-questions) · [Quick Start](#quick-start) · [Features](#features) · [Under the Hood](#under-the-hood)

</div>

## How it questions

An excerpt from a real mock interview (an Agent Evaluation Engineer role at a large tech company; company and candidate anonymised, the interviewer's lines and its recorded reasons are verbatim from the event log):

> **You said:** Numerator: mean prompt tokens per turn under layered compression; denominator: the mean with full history concatenated. Twenty-odd test sessions. The gap: I only measured length, not task success.
>
> **It asked next:** You volunteered that you never compared task success — good. Different direction: a prompt change moves your offline success rate up 3 points. What do you do first to tell real gain from noise?
>
> *Why it asked:* the length metric is settled (no success baseline); move to evaluation method and look for noise and decision criteria.

> **You said:** I would script constrained sessions, assert in code at turn twenty, and run the same config twice for a noise floor.
>
> **It asked next:** Both right. If two identical runs already differ by 5 points, what happens to your 3-point conclusion — how do you change set size and comparison?
>
> *Why it asked:* probe the criterion behind the noise floor.

The interviewer opens with your resume and the target job description, decides on its own whether to press, switch or close, and after the interview a separate scoring agent writes the report. The "why it asked" lines are shown to you in the report, turn by turn, under **How the interviewer questioned you**.

## Quick Start

### Try in your browser

Open [OfferCome](https://offercome.yuecao.dev/homepage), add your resume, and connect your own text model to practise. The web app starts with an empty workspace and saves your work and resume files in your browser.

Model connections, including API keys, are remembered in the browser by default; you can choose session-only storage. The server processes uploaded content and AI requests using your configuration without saving workspace data or keys to its database or files. Clearing site data removes your local copy.

**Boss Zhipin sync, voice answers and interview material import require local deployment.**

### Docker (recommended for local use)

**Requirements:** Docker Desktop or Docker Engine with Docker Compose.

```bash
git clone https://github.com/yuecao365/OfferCome.git
cd OfferCome
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000) and configure your model providers under **Settings**.

Your database and uploaded files persist in Docker volumes on your machine. Configured AI tasks send the relevant input to your chosen provider. Use `docker compose down` to stop; adding `-v` permanently deletes the data volumes.

### Run from source

**Requirements:** Node.js 22+ and npm; Chrome or Edge for Boss Zhipin login. Windows PowerShell:

```powershell
git clone https://github.com/yuecao365/OfferCome.git
Set-Location OfferCome
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and configure **Settings**. For browser login and sync, see the [deployment guide](docs/deployment.md#boss-zhipin-sync).

## Features

| Feature | What you can do |
| --- | --- |
| **AI mock interviews** | Paste a job description, pick a resume, start. The interviewer prepares its own agenda from the JD and your projects, follows your answers with probes, switches when a topic is exhausted, and closes on its own. Afterwards: a score with the formula shown, where you lost ground and what to practise, what held up, whether your resume claims survived questioning, and the interviewer's turn-by-turn reasoning. Voice answers locally. |
| **Interview history** | Record interviews manually, or import recordings, transcripts and notes locally. Review extracted questions before saving. Upcoming interviews have a preparation page. |
| **Review** | Group similar questions across real and mock interviews, compare your previous answers, and practise again. |
| **Capability profile** | Strengths and gaps across the dimensions the job cares about, each backed by excerpts from your answers; inspect or exclude evidence, launch targeted practice. |
| **Resumes** | Extract internships and projects from PDF, Word or image resumes; review, edit, and use them as interview material. |
| **Applications** | Import existing Boss Zhipin records or add applications manually; track stages in the dashboard. Sync reads your records; it never applies or messages on your behalf. |

> **Sync rule:** During a Boss sync, applications still at "Applied" with at least 30 days since their last recorded activity can be marked "Rejected". Deleted applications stay excluded. See [sync behavior](docs/deployment.md#boss-zhipin-sync).

## Project Preview

Screenshots use fictional data from a local deployment.

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

- **One agent loop, guarded by code.** Every interviewer turn first produces a structured move (signal / action / target / facet / notes) and only then the words. Interview state is a pure projection of an append-only event log, so it can be replayed. The code guards only a baseline (the candidate wants to stop, ten empty turns, a switch to a material that exists) and sends violations back for one retry, then decides the move itself; how deep to press, when to switch and when to close are the model's call. There is no clock and no turn quota: on the 30-task bench the interviewer closed on its own in 53% of sessions, up from 25% under the old quotas.
- **Runtime that makes cheap models usable.** Shared `runAgent()` with three tool permission tiers (read / write / confirm), four budgets (steps, tokens, time, cost), a `beforeTool` hook whose failures are fed back as tool results, and a three-stage output contract (schema narrowing → targeted retry with the validation error → caller fallback parsing). Across 1,636 real calls: 78.6% first-try pass, 97.0% usable output after degradation; 8M tokens for $0.46. Prompt layout is designed for prefix caching (stable system prompt, state card last): about 80% cache hits on interviewer turns, 63% across all calls. [Runtime](src/lib/ai/run-agent.ts).
- **Scoring is separate from interviewing.** A different agent, on a different model, scores each segment; it can look up the resume to check numbers, and every quote must be verbatim. Report weaknesses come with a concrete practice, and the report shows the interviewer's own turn-by-turn reasoning.
- **42 Agent Skills as method books, not question banks.** Two-level, many-to-many packs (base / domain / detail) the interviewer selects from an index and loads on demand. [Explore the packs](src/lib/mock-interviews/skills).
- **Layered memory, written by the agent.** In-session: a four-section notes file (to verify / concluded / doubtful / next) the interviewer rewrites every turn, pre-filled from the resume and the job description; code checks only the format, and the notes decide when the interview ends. Cross-session: a record of what each interview verified and which weaknesses keep recurring, read by planning in full and by the interviewer as an excerpt. Long-term: the capability profile, built from scores for you to read, not fed back to the agents. The report's **How the interviewer questioned you** is a projection of the notes.
- **InterviewBench.** A benchmark that treats any interviewer — a bare model with one prompt, a fixed script, or this system — as a black box: a static layer of 364 items with external ground truth (Beyond the Resumé, real interview write-ups), and an end-to-end layer of 30 real-JD tasks with hidden candidate profiles and planted facts, graded only from the transcript and scorecard. Against a same-model bare-prompt baseline this system's scorecards contain 0.10 vs 0.53 unverifiable quotes per session and ask one question per turn 76% vs 35% of the time; level judgement is not better than the baseline. [Bench README](eval/bench/README.md).

## Deployment Notes

The local app uses SQLite, persistent files, and background tasks. The web app uses browser storage and stateless request processing. See the [deployment guide](docs/deployment.md) for storage, Boss sync, and hosting requirements.

## License

Released under the [MIT License](LICENSE). © 2026 yuecao365.

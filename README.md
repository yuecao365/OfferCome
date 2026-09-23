<div align="center">

<h1><img src="docs/images/offercome-interviewer.png" alt="OfferCome — cartoon interviewer" width="240"></h1>

**An open-source AI workspace for tracking applications, managing resumes, and practising interviews. Use it in your browser or host it yourself.**

[简体中文](README_CN.md) · [Product Site](https://offercome.yuecao.dev) · [Try in Browser](https://offercome.yuecao.dev/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-42%20SKILL.md-8A63D2?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

## What it does

OfferCome keeps your applications, resumes and interview preparation in one place. Track application progress, save interview notes, or practise for a specific role.

Mock interviews are the main focus of development. Choose a resume and add a job description, and the AI asks about your projects, with follow-up questions based on your answers: what you worked on, why you chose an approach, and how you measured the results. After the interview, a report summarises what you answered well, what needs work and what to practise. You can also review the answers and follow-up questions.

An excerpt from an actual mock interview (company and candidate anonymised; translated from Chinese):

> **You said:** Numerator: mean prompt tokens per turn under layered compression; denominator: the mean with full history concatenated. Twenty-odd test sessions. The gap: I only measured length, not task success.
>
> **It asked next:** You volunteered that you never compared task success — good. Different direction: a prompt change moves your offline success rate up 3 points. What do you do first to tell real gain from noise?
>
> *About this follow-up:* the candidate explained how they measured prompt length but had not compared task success. The next question checks how they would assess the reliability of an evaluation result.

Review several interviews together to compare your answers to similar questions. The capability profile summarises strengths and areas to improve across those answers, helping you plan further practice.

## Quick Start

**In the browser.** Open [OfferCome](https://offercome.yuecao.dev/homepage), add a resume and configure your model API in Settings. Workspace data is saved in your current browser; when you use AI features, relevant material is sent to your chosen model provider for processing. Boss Zhipin sync, voice answers and full interview recording imports require a local deployment.

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
| **AI mock interviews** | Questions based on the role and your projects, with follow-ups based on your answers. Review scores, improvement suggestions and follow-up questions afterwards. Voice answers are available locally. |
| **Interview history** | Record interviews manually or import transcripts and notes. Recording imports are also available locally. View preparation suggestions for upcoming interviews. |
| **Review** | Similar questions from real and mock interviews grouped together, with your previous answers. |
| **Capability profile** | Review skills, strengths and areas to improve by role, with relevant answers for reference. |
| **Resumes** | Internships and projects extracted from PDF, Word or image resumes, editable, used as interview material. |
| **Applications** | Import Boss Zhipin records or add applications by hand; track stages. Sync only reads; it never applies or messages for you. |

## Preview

Screenshots use fictional demo data.

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

- **Interview action validation.** The model outputs an action and target, such as a follow-up, topic change, clarification or end. Code validates it against the session state, requests a retry if needed, and selects a fallback after a second failure. Prompt instructions and citation checks help reduce interference from untrusted input.
- **Event-sourced sessions.** An append-only event log is used to compute progress, session state for the model and scoring segments. Individual turns can be replayed to check the effect of prompt changes.
- **Interview memory.** The model keeps notes on unresolved questions and its findings to help plan follow-ups and decide when to finish. There is no fixed time or turn limit. Cross-session records track recurring weaknesses, and scores update the capability profile.
- **One runtime for every agent.** Three-stage output contract (schema → retry with the validation error → fallback parse), three tool permission tiers, four budgets, prompts laid out for prefix caching. 1,636 real calls: 78.6% first-try pass, 97.0% usable after degradation. [Runtime](src/lib/ai/run-agent.ts).
- **Independent scoring.** A separate agent evaluates answers, with a separately configurable model and resume lookup to check numbers. Code checks quotes against the source text. [Model configuration and defaults](docs/interview-pipeline.md).
- **42 interview skill packs.** Assessment topics and follow-up guidance for different specialities, loaded on demand. [Packs](src/lib/mock-interviews/skills).
- **InterviewBench.** Any interviewer — a bare model, a fixed script, this system — submitted through one interface and graded only from the transcript and scorecard. Against the same model with a single prompt: 0.10 vs 0.53 unverifiable quotes per session, one question per turn 76% vs 35%; level judgement is not better than the baseline. [Bench](eval/bench/README.md).

## License

[MIT](LICENSE). © 2026 yuecao365.

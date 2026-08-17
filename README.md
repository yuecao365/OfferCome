<div align="center">

# OfferLai

**A local-first workspace that turns every application and interview into better preparation for the next one.**

[简体中文](README_CN.md) · [Product Site](https://offer-lai.vercel.app) · [Live Preview](https://offer-lai.vercel.app/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma)
![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-SKILL.md-8A63D2?style=flat-square)

[Introduction](#introduction) · [Preview](#project-preview) · [How It Works](#how-it-works) · [Features](#features) · [Under the Hood](#under-the-hood) · [Quick Start](#quick-start)

</div>

## Introduction

Job hunting scatters your effort: applications live in one platform, resumes in a folder, interview memories in your head, and the lessons from a bad answer disappear before the next interview. OfferLai connects applications, resumes, real interviews, AI mock practice, review, and a long-term capability profile into one workspace, so each round feeds the next.

> **Local-first by design.** Your SQLite database, resume files, and Boss Zhipin browser session stay on your own machine. AI providers are contacted only after you configure a model service yourself, and only with the content that task requires.

## Project Preview

The [live preview](https://offer-lai.vercel.app/homepage) runs on fictional data in read-only mode. It never accepts or stores resumes, interview records, API keys, or Boss Zhipin credentials. Run it locally for the complete, writable product.

<table>
  <tr>
    <td width="50%" align="center"><strong>Dashboard</strong><br><img src="docs/images/dashboard.png" alt="OfferLai dashboard"></td>
    <td width="50%" align="center"><strong>Applications</strong><br><img src="docs/images/applications.png" alt="OfferLai applications"></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>AI Mock Interview</strong><br><img src="docs/images/mock-interview.png" alt="OfferLai AI mock interview"></td>
    <td width="50%" align="center"><strong>Interview History</strong><br><img src="docs/images/interview-history.png" alt="OfferLai interview history"></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Interview Review</strong><br><img src="docs/images/interview-review.png" alt="OfferLai interview review"></td>
    <td width="50%" align="center"><strong>Capability Profile</strong><br><img src="docs/images/ability-profile.png" alt="OfferLai capability profile"></td>
  </tr>
</table>

## How It Works

OfferLai is built around one loop. Every stage produces evidence that makes the next stage sharper.

```
Applications ──▶ Resume & projects ──▶ AI mock interview ──▶ Real interview
     ▲                                        │                     │
     │                                        ▼                     ▼
     └──────────── Capability profile ◀── Review & scoring ◀── Import & transcribe
```

1. **Import your applications** so the workspace knows which roles you are actually chasing.
2. **Upload a resume**; OfferLai indexes your internships and projects as reusable interview material.
3. **Run a mock interview** grounded in interview skill packs, that resume, and everything you have answered before.
4. **Record the real interview** afterwards — drop in audio, a transcript, or your own notes.
5. **Review by project or question bank**, where repeated questions gather all your past answers side by side.
6. **Watch the capability profile update**, then practise the weak spots it names with one click.

## Features

### Applications

Import your existing Boss Zhipin records with one click: OfferLai drives a local browser through the Chrome DevTools Protocol, walks the pages, deduplicates stable job identities, and highlights what is new or changed. Applications idle for 30 days are flagged as rejected during a sync — a judgement made only while syncing, never behind your back. Login, QR codes, CAPTCHAs, and security checks are always completed by you; OfferLai reads your records and never applies or messages anyone on your behalf. Records you delete stay deleted and are not resurrected by the next sync. Applications can also be created and edited by hand, and every stage change flows into the dashboard.

### Resumes

Upload a PDF, Word, or image resume and OfferLai extracts your internships and projects. A confirmation step lets you rename an entry or merge it into an existing one before anything is written, which keeps the review index free of near-duplicate projects. The parsed experiences become the material that mock interviews and project deep-dive questions draw on.

### AI mock interviews

Each session is generated from **interview skill packs** (see below), your selected resume and projects, relevant answers from past interviews, and current profile insights — not from a generic question bank. Because real job descriptions are so often vague or stale, the JD is treated as a hint about role direction and stack rather than the source of truth.

Answer by typing or by voice: the browser reads each question aloud, records up to ten minutes through the microphone, transcribes it with your configured speech model, and lets you edit the transcript before submitting. Raw answer audio is used for transcription only and never stored. The interviewer follows up when an answer leaves an obvious gap, and you can skip a question you would rather not answer.

Every question is scored against a rubric generated when the question was written, so scoring stays consistent across answers. The report shows a total score, per-question evidence, strengths, improvements, an action plan, and how many questions came from the job description versus generic role requirements.

### Interview history and import

Record a completed interview by hand, or simply drop in what you already have: audio, a verbatim transcript, a written summary, PDF, Word, or plain text. OfferLai works out the rest — whether the file is audio or text, whether a recording contains the interviewer, which speaker is you, and whether text is a transcript or a summary. It also extracts the company, role, round, and date to prefill the form. Recording and question recognition run as a single action, and long recordings are chunked automatically for upload and transcription. Questions arrive as an editable draft, classified and linked to the right project; nothing is saved until you confirm.

Interviews scheduled in the future become preparation targets: a dedicated page gathers what that company has asked before and which of your abilities are currently weakest.

### Interview review

Review questions through the lens of a single internship or project, or through the technical and general question banks. Repeated questions are merged — including near-duplicate phrasings — so you can see every answer you have given to the same question across companies, newest first, with the source interview attached. Filtering and pagination happen on the server, and you can practise any answered question again with one click.

### Capability profile

Completing any interview, real or mock, schedules a profile refresh in the background. From your very first interview you get a qualitative card of what to keep doing and what to practise, with each weak point linking straight into targeted practice. As evidence accumulates, eight ability dimensions — grouped into **content**, **evidence**, and **delivery** — gain levels, trends, and confidence ratings, weighted so that real interviews count for more than mock ones and recent evidence counts for more than old.

Insights are written as coaching, not verdicts: every one must land on something you can act on, and each is backed by verbatim excerpts from your own answers. You can inspect the evidence behind any insight, exclude a piece of evidence you disagree with, reassign a dimension, or lock an insight so refreshes leave it alone. Spoken delivery is measured from voice metrics rather than guessed from text, and is simply omitted when a recording cannot be attributed reliably.

## Under the Hood

Some design choices that shape how the product behaves:

**Layered interview skill packs.** Interview know-how lives in `SKILL.md` files — YAML frontmatter plus markdown, following the Agent Skills convention — organised in three layers: a **base** pack for project deep-dive questioning, **domain** packs for architecture-level questioning, and **stack** packs for language-specific depth. Ten packs ship by default (backend, frontend, AI/LLM, CS fundamentals, algorithms, plus Java, Go, React and Vue stacks). Each pack encodes high-frequency topics, depth ladders, good-versus-bad question examples, and project follow-up chains, which is what keeps generated questions concrete instead of asking you to "talk about your understanding of X".

**Progressive disclosure with a safety net.** Only pack names and descriptions stay in the agent's context; the question generator calls a `load_skill` tool to pull the full text of whatever it judges relevant, and loading a stack pack automatically brings in its parent domain pack. If a weaker model never calls the tool, a keyword selector deterministically injects the recommended packs on a retry — question quality does not depend on a model's tool-calling ability.

**Verified generation.** The model proposes; deterministic code decides. Citations must be real: a competency claiming to quote the job description is checked against the original text, and profile evidence must appear verbatim in your own answer. Everything the model reads — job descriptions, resumes, your answers, web results — is treated as untrusted data, and instructions embedded in it are ignored.

**Tiered verification, so you are never left empty-handed.** Hard gates are limited to injection defence, citation authenticity, and write atomicity. Everything else degrades or ranks rather than refusing: job analysis has a four-level fallback chain and cannot fail outright, question counts are a range instead of an exact number, and duplicates or weak relevance lower a question's rank instead of discarding it. When something genuinely cannot be produced, the product says what it did instead — it does not hand you a dead end.

**A single agent runtime.** Every AI call goes through one `runAgent()` entry point that handles timeouts, structured output, rescue parsing of truncated responses, retry and degradation policy, error classification, prompt versioning, and structured per-call logging with token usage and accept/reject counts.

**Provider-flexible.** Text understanding and speech-to-text are configured independently — provider, model, API key, and custom OpenAI-compatible endpoints — so you can pair a strong reasoning model with a cheap transcription one, or point both at a local server. Only the AI tasks you configure ever send data anywhere.

## Quick Start

### 1. Live preview

Open the **[OfferLai live preview](https://offer-lai.vercel.app/homepage)**. Read-only; nothing you do there is saved.

### 2. Local Docker deployment (recommended)

**Requirements:** Docker Desktop or Docker Engine with Docker Compose.

```bash
git clone https://github.com/yuecao365/OfferLai.git
cd OfferLai
docker compose up -d --build
```

Open **[http://localhost:3000](http://localhost:3000)**. SQLite data and uploaded files persist in the `offerlai-data` and `offerlai-local` Docker volumes.

```bash
docker compose logs -f offerlai
docker compose down
```

> `docker compose down` preserves the volumes. `docker compose down -v` permanently deletes them.

### 3. Run from source

**Requirements:** Node.js 22+, npm, and Chrome or Edge for Boss Zhipin login.

```powershell
git clone https://github.com/yuecao365/OfferLai.git
Set-Location OfferLai
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**, then configure your model providers under **Settings** before using any AI feature. For Boss Zhipin synchronization:

```powershell
npm run boss:login
npm run boss:sync -- --dry-run
npm run boss:sync
```

> Boss Zhipin login, QR codes, CAPTCHAs, and security checks must be completed manually by the account owner. A standard Docker container cannot open a headed browser on the host desktop, so login and sync work best when running from source.

## Deployment Notes

OfferLai is designed as a local-first application. Several workflows depend on long-running tasks or local resources: LLM calls may run for 60 seconds or longer, audio transcription can run for up to 10 minutes, large recordings are chunked and may be split with ffmpeg, mock-interview generation and profile refreshes use Next.js `after()` background work, Boss synchronization drives a local browser over the Chrome DevTools Protocol, and resume files plus browser session state live on the local filesystem.

Deploying the writable product to a serverless platform such as Vercel therefore requires your own answers for function timeouts, an ffmpeg runtime, durable background execution, and persistent file and database storage. The hosted Vercel site in this repository is a read-only preview; for the complete product, use the local Docker Compose deployment described above.

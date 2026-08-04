<div align="center">

# OfferLai

**A local-first workspace for managing your complete job-search journey.**

[简体中文](README_CN.md) · [Product Site](https://offer-lai.vercel.app) · [Live Preview](https://offer-lai.vercel.app/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma)
![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?style=flat-square&logo=sqlite)
![Playwright](https://img.shields.io/badge/Playwright-1.61-2EAD33?style=flat-square&logo=playwright&logoColor=white)

[Introduction](#introduction) · [Preview](#project-preview) · [Highlights](#feature-highlights) · [Quick Start](#quick-start)

</div>

## Introduction

OfferLai brings job applications, resumes, real interviews, AI mock interviews, interview reviews, and capability profiles into one focused career workspace.

> **Local-first by design:** SQLite data, resume files, and Boss Zhipin login state stay on your own device. AI providers are contacted only after you explicitly configure a model service.

## Project Preview

The [live preview](https://offer-lai.vercel.app/homepage) uses fictional data in read-only mode. It does not accept or store resumes, interview records, API keys, or Boss Zhipin login information. Use a local deployment for the complete writable product.

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

## Feature Highlights

| Area | Capabilities |
| --- | --- |
| **Local-first privacy** | Keep SQLite data, resume files, and login state on your own machine without an OfferLai-hosted central database. |
| **Application tracking** | Create, edit, delete, search, filter, sort, and paginate applications; optionally synchronize your existing Boss Zhipin conversations. |
| **Resume workspace** | Upload PDF, Word, and image resumes; preview or download files; select a default resume; and extract internship and project indexes. |
| **Real interview records** | Manage companies, roles, rounds, dates, questions, answers, and notes, with optional transcription and structured import. |
| **AI mock interviews** | Generate practice questions from a target JD, resume, and interview history; answer by text or voice and receive per-question feedback. |
| **Interview review** | Group historical answers by internship, project, technical topic, or general question for focused revision. |
| **Capability profile** | Organize evidence-backed ability dimensions, strengths, weaknesses, trends, and training priorities. |
| **Flexible model settings** | Configure text-understanding and speech-to-text providers, models, API keys, and endpoints independently. |

## Quick Start

### 1. Live Preview

Open the **[OfferLai live preview](https://offer-lai.vercel.app/homepage)**. This environment is read-only and does not persist changes.

### 2. Local Docker Deployment (Recommended)

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

> `docker compose down` preserves the volumes. `docker compose down -v` permanently deletes the local volumes.

### 3. Run from Source

**Requirements:** Node.js 22+, npm, and Chrome or Edge for manual Boss Zhipin login.

```powershell
git clone https://github.com/yuecao365/OfferLai.git
Set-Location OfferLai
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. To use Boss Zhipin synchronization, run locally:

```powershell
npm run boss:login
npm run boss:sync -- --dry-run
npm run boss:sync
```

> Boss Zhipin login, QR codes, CAPTCHAs, and security checks must be completed manually by the account owner. A standard Docker container cannot open a headed browser on the host desktop, so login and sync currently work best when running from source.

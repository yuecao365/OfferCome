# OfferLai

[简体中文](README_CN.md)

## Introduction

OfferLai is a local-first career management workspace for tracking job applications, resumes, real interviews, AI mock interviews, interview reviews, and capability profiles.

For normal use, the SQLite database, resume files, and Boss Zhipin login state stay on the user's own device. AI providers are contacted only after the user explicitly configures a model service.

## Project Preview

- **Product overview:** [https://offer-lai.vercel.app](https://offer-lai.vercel.app)
- **Live preview:** [https://offer-lai.vercel.app/homepage](https://offer-lai.vercel.app/homepage)

> The live preview uses fictional data in read-only mode. It does not accept or store resumes, interview records, API keys, or Boss Zhipin login information. Use a local deployment for the complete writable product.

### Dashboard

![Dashboard](docs/images/dashboard.png)

### Applications

![Applications](docs/images/applications.png)

### AI Mock Interview

![AI Mock Interview](docs/images/mock-interview.png)

### Interview History

![Interview History](docs/images/interview-history.png)

### Interview Review

![Interview Review](docs/images/interview-review.png)

### Capability Profile

![Capability Profile](docs/images/ability-profile.png)

## Feature Highlights

- **Local-first privacy:** SQLite data, resume files, and login state remain on the user's machine without an OfferLai-hosted central database.
- **Application tracking:** Create, edit, delete, search, filter, sort, and paginate applications, with optional read-only synchronization of the user's existing Boss Zhipin conversations.
- **Resume workspace:** Upload PDF, Word, and image resumes; preview or download files; select a default resume; and extract internship and project indexes.
- **Real interview records:** Manage companies, roles, rounds, dates, questions, answers, and notes, with optional transcription and structured import.
- **AI mock interviews:** Generate practice questions from a target JD, resume, and interview history, then answer by text or voice and review per-question feedback.
- **Interview review:** Group historical answers by internship, project, technical topic, or general question.
- **Capability profile:** Organize evidence-backed ability dimensions, strengths, weaknesses, trends, and training priorities.
- **Flexible model settings:** Configure text-understanding and speech-to-text providers, models, API keys, and endpoints independently.

## Quick Start

### Option 1: Live Preview

Open the [OfferLai live preview](https://offer-lai.vercel.app/homepage). This environment is read-only and does not persist changes.

### Option 2: Local Docker Deployment (Recommended)

Requirements: Docker Desktop or Docker Engine with Docker Compose.

```bash
git clone https://github.com/yuecao365/OfferLai.git
cd OfferLai
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000). SQLite data and uploaded files persist in the `offerlai-data` and `offerlai-local` Docker volumes.

```bash
docker compose logs -f offerlai
docker compose down
```

`docker compose down` preserves the volumes. `docker compose down -v` permanently deletes the local volumes.

### Option 3: Run from Source

Requirements: Node.js 22+, npm, and Chrome or Edge for manual Boss Zhipin login.

```powershell
git clone https://github.com/yuecao365/OfferLai.git
Set-Location OfferLai
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To use Boss Zhipin synchronization, run locally:

```powershell
npm run boss:login
npm run boss:sync -- --dry-run
npm run boss:sync
```

Login, QR codes, CAPTCHAs, and security checks must be completed manually by the account owner. A standard Docker container cannot open a headed browser on the host desktop, so Boss Zhipin login and sync currently work best when running from source.

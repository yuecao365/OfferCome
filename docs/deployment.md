# Deployment Guide

[简体中文](deployment_CN.md) · [Back to README](../README.md)

## Modes and data

| | Local deployment | Web app (`APP_MODE=trial`) |
| --- | --- | --- |
| Workspace | SQLite and files on the machine running OfferCome | Browser storage; clearing site data removes the local copy |
| Resume originals | Local filesystem | Browser IndexedDB; uploads are processed by the server for parsing |
| Model configuration | Stored in the local app | Stored in the browser; remembered by default, with a session-only option |
| AI requests | Sent to your configured provider | Configuration and task input pass through the server to your configured provider |
| Boss sync, voice answers, interview material import, web search | Available | Not available |

The web app starts empty. Its request handlers process data without saving workspace records, uploaded files, or model keys to server databases or files. Browser storage does not sync across devices. The model provider still receives the input needed for AI tasks; browser storage does not mean all processing happens on-device.

In local mode, text understanding and speech-to-text have separate provider settings. OpenAI-compatible and local model endpoints are supported. Configure them under **Settings** before using the corresponding AI features.

## Boss Zhipin sync

Run from source on a desktop with Chrome or Edge. The standard Docker setup cannot open a browser window on the host desktop.

```powershell
npm run boss:login
npm run boss:sync -- --dry-run
npm run boss:sync
```

Complete login, QR codes, CAPTCHAs, and security checks yourself. Sync reads existing application records; it does not apply to jobs or send messages.

- Records are deduplicated, and previously deleted applications stay excluded.
- During sync, applications still at “Applied” can be marked “Rejected” after 30 days without recorded activity. Other existing stages are preserved.
- The cutoff uses the last known source activity time, falling back to application or first-seen time. Old records can also be marked rejected on their first import.
- This rule runs during sync, not on an independent timer. Use the dry run to inspect proposed changes.

## Docker storage and maintenance

The repository's [Compose configuration](../docker-compose.yml) mounts:

- `offercome-data` at `/data` for SQLite.
- `offercome-local` at `/app/.local` for uploaded files and other local state.

View logs or stop the app:

```bash
docker compose logs -f offercome
docker compose down
```

Stopping keeps the volumes. **`docker compose down -v` permanently deletes them.** Back up both volumes before deleting or replacing stored data.

## Hosting requirements

The full local app needs persistent database and file storage, a Node.js runtime, and support for long-running work. Audio import may use ffmpeg, and mock-interview generation and profile refreshes run background tasks.

Moving that mode to a serverless host requires addressing function timeouts, request-size limits, background-task execution, and persistent storage. The web mode avoids server-side persistence by using browser storage and stateless request handlers, but AI requests remain subject to the host's time and payload limits.

Vercel defaults to web mode unless explicitly overridden. Changing the mode flag alone does not provide the infrastructure needed by the full local app.

Web-mode API routes each make a single model call and declare their own `maxDuration` (`/api/trial/brief` needs up to 90 s; the others 60 s). On the Vercel Hobby plan, enable Fluid Compute so the 90 s budget applies; without it functions are capped at 60 s and a slow model can time out during briefing (the progress card then offers a retry that only reruns the failed step).

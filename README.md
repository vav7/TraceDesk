<div align="center">

# TraceDesk

### Every failure becomes evidence. Every evidence becomes an answer.

A full-stack SaaS integration troubleshooting platform. Reproduce integration failures in a sandboxed lab, capture wire-level evidence, auto-diagnose root causes, manage incidents against SLAs, escalate to engineering, and turn every resolution into a runbook.

[![Live](https://img.shields.io/badge/Live-Render-39FF14?style=plastic&logo=render&logoColor=white)](https://tracedesk-app.onrender.com/)
[![CI](https://github.com/vav7/tracedesk/actions/workflows/ci.yml/badge.svg)](https://github.com/vav7/tracedesk/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-66-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![Node](https://img.shields.io/badge/node-22-3c873a)
![License](https://img.shields.io/badge/license-mit-blue)

**React 18 · TypeScript · Vite · Tailwind CSS · Express · PostgreSQL · Server-Sent Events**

</div>

---

## Why TraceDesk exists

Most monitoring tooling shows you a red dashboard after the customer has already left. TraceDesk works the other way round: it reproduces the failure on demand, keeps the raw provider response as evidence, and forces every conclusion to cite that evidence. Diagnoses come from a deterministic rules engine, not vibes - and when the fix lands, the incident compiles into a runbook: the exact document the next on-call engineer needs at 3am.

**The TraceDesk signature:** every request becomes telemetry, every failure becomes an incident with evidence, every evidence set becomes a diagnosis.

## Highlights

| Area | What you get |
| --- | --- |
| **Troubleshooting Lab** | Run `200 / 401 / 403 / 404 / 429 / 500 / timeout` scenarios against any connector with a terminal-style console, hop-by-hop route tracing, visible retries and backoff |
| **10 connectors, badged** | `LIVE` (real HTTPS: GitHub, Coinbase, httpbin.org, Open-Meteo, your own URL) and `SIMULATED` (deterministic: Slack, Jira, Stripe, SendGrid, Twilio) - badged on every card, result and evidence panel |
| **Bring your own everything** | Custom Endpoint calls any URL you own (SSRF-hardened); live connectors accept custom headers - paste a real GitHub token and watch a 401 become a 200 with your username |
| **Incident management** | Auto-filed incidents with per-attempt evidence, deterministic diagnosis with confidence scores, `open → investigating → resolved` lifecycle, severity SLAs (1h/4h/8h/24h) with live timers and breach flags |
| **Alert grouping** | Identical failures inside a 10-minute window attach to one incident as extra evidence instead of spamming duplicates |
| **Runbooks + AI** | Resolved incidents compile into runbooks; optional AI drafting works with any OpenAI-compatible key (free Groq/Gemini tiers work) and is always badged with provenance |
| **Realtime everything** | One SSE stream (`/api/events`) drives live metrics, activity feed, alert bell and toasts across every open window - no polling, no extra dependencies |
| **Webhook ingress** | `POST /api/webhooks/:slug` accepts real payloads from external tools; 4xx/5xx deliveries auto-file incidents with the raw payload as evidence |
| **Zero config** | An in-memory Postgres-compatible engine (pg-mem) migrates the schema and seeds a realistic 24-hour demo dataset at first boot - no database server, no `.env` |

## Quick start

Prerequisites: Node.js 22 (pinned in `.node-version`). No database, no `.env` needed.

```bash
npm run setup     # installs root + backend dependencies
npm run dev       # API on :3001, frontend on :5173
```

Open **http://localhost:5173** - the workspace boots with demo data already seeded.

Single-process production mode (Express serves the built SPA and the API on one origin):

```bash
npm run serve     # build everything, then serve on :3001
```

### Data modes

| Mode | When | Persistence | Setup |
| --- | --- | --- | --- |
| In-memory (default) | no `DATABASE_URL` | resets on restart | none: auto-migrate + demo seed at startup |
| PostgreSQL | `DATABASE_URL` set | durable | none: connectivity check, auto-migrate, auto-seed |

If `DATABASE_URL` is set but unreachable, the server falls back to in-memory so demos never die (disable with `DB_STRICT=true`).

## Architecture

```text
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────────┐
│  CLIENT PLANE   │      │   CONTROL PLANE      │      │  DATA + EDGE PLANE  │
│                 │      │                      │      │                     │
│  React 18 SPA   │─────▶│  Express 4 API       │─────▶│  PostgreSQL / pg-mem│
│  Vite · Tailwind│ REST │  zod · request IDs   │      │  migrations + seed  │
│  SSE client     │◀─────│  SSE bus /api/events │◀─────│  5 live + 5 sim     │
└─────────────────┘ SSE  └──────────────────────┘      │  connectors         │
                                                       └─────────────────────┘
```

Requests flow left to right; every domain event streams back over Server-Sent Events to all connected browsers in realtime.

## Project structure

```text
tracedesk/
├── src/                        # React 18 frontend (Vite SPA)
│   ├── pages/                  #   Dashboard · Integrations · Incidents · Lab · Runbooks · Help
│   ├── components/
│   │   ├── ui/                 #   badges, cards, chips, page headers, empty states
│   │   ├── motion/             #   SplitText · Reveal · TiltCard · Spotlight
│   │   ├── charts/             #   dependency-free SVG timeline + uptime strips
│   │   └── Layout/             #   sidebar, header, shell
│   ├── lib/                    # API client, SSE context, theme, SLA math, helpers
│   └── __tests__/              # Vitest + Testing Library suites
├── backend/
│   ├── src/
│   │   ├── routes/             # REST + SSE + webhook endpoints
│   │   ├── controllers/        # request handlers
│   │   ├── services/           # diagnosis engine, incidents, telemetry, event bus, runbooks
│   │   ├── integrations/       # 5 live + 5 simulated connectors
│   │   ├── middleware/         # request context, errors, rate limits
│   │   ├── config/             # db bootstrap: PostgreSQL ⇄ in-memory (pg-mem)
│   │   └── tests/              # Vitest + Supertest suites
│   └── db/migrations/          # SQL schema + indexes
├── e2e/                        # Playwright end-to-end happy path
├── docs/API.md                 # full REST reference
├── tools/                      # WCAG contrast auditor
├── Dockerfile                  # multi-stage production image (healthcheck included)
├── render.yaml                 # one-service Render Blueprint (health-proof build)
├── docker-compose.yml          # local container run (optional Postgres)
├── vercel.json                 # SPA rewrites for split deployment
└── .github/workflows/          # CI + keep-warm
```

## API

Full reference: [`docs/API.md`](docs/API.md). Core endpoints:

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | liveness/readiness + database mode |
| `GET /api/events` | SSE stream: telemetry, incident, webhook, runbook and reset events |
| `POST /api/integrations/:slug/simulate` | run a scenario: `success / 401 / 403 / 404 / 429 / 500 / timeout` |
| `GET /api/incidents` · `GET /api/incidents/:id` | list / detail with evidence, timeline, diagnosis, SLA |
| `POST /api/incidents/:id/resolve` · `/status` · `/notes` | lifecycle transitions and timeline notes |
| `GET /api/incidents/:id/escalation-report` | Markdown escalation report for engineering |
| `POST /api/incidents/:id/runbook` | generate a runbook (deterministic or AI) |
| `POST /api/webhooks/:slug` | public webhook listener (202, auto-incident on failures) |
| `GET /api/dashboard/stats · /timeline · /health` | live metrics, hourly buckets, per-integration uptime |
| `POST /api/system/reset` | clear operational data for a fresh demo |

## Configuration

Everything is optional for local development (`backend/.env`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | API port (Render injects its own) |
| `DATABASE_URL` | unset | PostgreSQL connection string; unset = in-memory mode |
| `DB_STRICT` | `false` | fail at startup instead of falling back to memory |
| `AUTO_MIGRATE` / `AUTO_SEED` | `true` | migrate / seed at startup |
| `GROUP_WINDOW_MINUTES` | `10` | alert-grouping window for identical failures |
| `WEBHOOK_SECRET` | unset | require `X-Webhook-Secret` or Bearer on webhook deliveries |
| `ALLOW_PRIVATE_TARGETS` | `false` | let the Custom Endpoint call private ranges (dev only; cloud metadata always blocked) |
| `AI_API_KEY` | unset | enables AI-assisted runbooks (free Groq/Gemini tiers work) |
| `AI_BASE_URL` / `AI_MODEL` | Groq / `llama-3.1-8b-instant` | any OpenAI-compatible endpoint |

Frontend (`.env` at repo root): `VITE_API_URL` (only for split deployments), `VITE_DEV_API_TARGET` (dev proxy target). Never commit `.env` files.

## Testing

```bash
npm test              # frontend (Vitest + Testing Library) + backend (Vitest + Supertest)
npm run test:e2e      # Playwright: simulate -> escalate -> investigate -> resolve -> runbook
```

66 unit/API tests covering grouping windows, SLA math, validation, webhook auth, SSRF guards and UI components, plus an E2E that drives the real UI. GitHub Actions runs typechecks, both suites, the Docker build and the E2E on every push.

## Deployment

**Render (recommended, one service):** this repo is a Render Blueprint - dashboard → New + → Blueprint → select the repository. `render.yaml` builds both apps, serves them from one process, and health-checks `/api/health` (registered before every route and exempt from rate limiting, so deploys pass as soon as the process listens).

**Docker:**

```bash
docker build -t tracedesk .
docker run -p 3001:3001 tracedesk
# or: docker compose up --build
```

**Split:** static frontend on Vercel (`vercel.json` handles SPA rewrites), API on Render, PostgreSQL on Supabase/Neon - set `VITE_API_URL` and `DATABASE_URL`.

## Notes

- Simulated connectors are deterministic demos, not provider connections. Live connectors reproduce only what the provider genuinely returns (GitHub: real `success`/`401`/`404`; the HTTP Status Probe: the full real matrix via httpbin.org). Every artifact is badged so the two are never confused.
- Live connectors depend on the public internet; offline they degrade gracefully into timeout telemetry - which itself files incidents.
- In-memory mode resets on restart; use PostgreSQL for persistence. AI assistance is optional and key-gated; AI output is always badged with provenance.

---

<div align="center">

made with ❤️ by **vav7**

© tracedesk 2026 · all rights reserved

</div>

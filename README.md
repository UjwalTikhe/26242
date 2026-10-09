# SIH26242 — AI-Assisted RPL Skill Assessment Tool

Monorepo for Smart India Hackathon problem statement 26242.

**Worker → Self Declaration → AI NSQF Mapping → Practical Test → AI Analysis → Assessor Review → Competency Report → Final Approval**

## Structure

| Path | Owner | Purpose |
| --- | --- | --- |
| `contracts/` | both | Zod schemas + status state machine + generated `openapi.json` — the single source of truth. **Nobody changes it without telling the other.** |
| `backend/` | Person B (backend) | Express + TypeScript API, AI pipeline worker, scoring engine, reports |
| (future) `frontend/` | Person A (field side) | Worker PWA + assessor portal |

## Stack

- **API**: Node 20+, Express 5, TypeScript (ESM), Zod validation, JWT + role middleware
- **DB**: MongoDB + Mongoose, BullMQ + Redis worker, vector retrieval over QP/NOS knowledge base
- **Uploads**: tus resumable protocol, storage driver abstraction (local disk → S3/R2)
- **AI**: OpenAI-compatible LLM (structured JSON, vision, ASR) with deterministic fallback when no key is set — AI fills item scores only, pass/fail is code
- **Reports**: PDFKit + QR certificate, public `/verify/:id` page
- **Testing**: Vitest + Supertest (+ mongodb-memory-server)

## Quick start

```bash
npm install
cp .env.example .env
npm run infra:up          # MongoDB + Redis via Docker
npm run openapi           # regenerate contracts/openapi.json (commit it)
npm run dev               # API on http://localhost:4000
npm run dev:worker        # optional: BullMQ worker (QUEUE_DRIVER=bullmq)
npm test                  # integration tests (no infra needed)
```

## Roles

`worker` (phone OTP) · `assessor` (email+password) · `authorized_assessor` · `admin`

## Status state machine (shared with frontend)

```
DRAFT → DECLARED → MAPPED → PLAN_READY → IN_PROGRESS → SUBMITTED
  → AI_ANALYZED → UNDER_REVIEW → (REVIEWED | REASSESS→IN_PROGRESS)
  → APPROVED / REJECTED
```

Defined once in `contracts/src/enums.ts` (`ASSESSMENT_TRANSITIONS`, `canTransition()`).

## Contract rules (Day-1 agreements)

- Client-generated UUIDs + `Idempotency-Key` header on every write
- Evidence is append-only (content immutable after creation)
- Worker data: last-write-wins with a `version` field
- Assessor and approval fields are server-authoritative
- Uploads are chunked and resumable (tus)

## Backend status (Person B)

All phases implemented and tested (`npm test` — 116 integration tests, real
`mongod` via mongodb-memory-server; `npm run typecheck` clean).

| Phase | What landed |
| --- | --- |
| 0 | Monorepo, `@sih/contracts` (Zod schemas, state machine, generated OpenAPI 3.1) |
| 1 | Contract-driven router, phone-OTP + assessor auth, refresh rotation, role guards, profile LWW |
| 2 | Electrician + Welder trade packs (sourced QP/NOS), assessment domain, plan generation, deterministic NSQF mapping |
| 3 | Storage driver seam, tus resumable uploads, append-only evidence with per-assessment SHA-256 chain, offline sync push/pull, answers LWW |
| 4 | AI analysis pipeline (submit → grade/analyze → `AI_ANALYZED`), deterministic-first with LLM/vision/ASR upgrades, BullMQ worker |
| 5 | Scoring engine (review-over-AI precedence, weighted overall, critical-safety veto, NSQF bands) + assessor review/claim/decision |
| 6 | Competency report, certificate PDF + QR, public `/verify/:certificateNo`, tamper-evident per-assessment audit chain |
| 7 | Socket.IO real-time, fairness analytics, Docker image + prod compose |

### API surface

40+ routes are declared in `contracts/src/api.ts` and served 1:1 by
`backend/src/routes` (auth guards + Zod parsing applied uniformly). Every route
is implemented — there are no 501 stubs left.

### Real-time (Socket.IO)

Connect to `ws(s)://<host>/realtime` with the access token in the handshake
(`auth.token` or `?token=`). Then:

- `assessment:subscribe { assessmentId }` → ack `{ ok }` (workers may only
  watch their own assessments; assessors/admin may watch any)
- server → `assessment:status { assessmentId, status, from, round, version, at }`
- server → `analysis:ready { assessmentId, round, mode, pendingHumanTasks, at }`

The channel is a no-op until the HTTP server calls `initRealtime()`; unit tests
that mount the app with supertest are unaffected.

### Deploy

```bash
cp .env.example .env          # set JWT secrets + PUBLIC_BASE_URL
docker compose -f docker-compose.prod.yml up --build
```

Single-service hosts (Render/Railway) can run just `Dockerfile`'s image with
`QUEUE_DRIVER=inline` (analysis runs in the API process; no Redis needed). The
same image runs the BullMQ worker via `node backend/dist/worker/main.js`.

### Environment

See `.env.example`. Nothing is required to boot locally (mock OTP, inline queue,
local disk storage); production should set `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `PUBLIC_BASE_URL`, and either `REDIS_URL` or
`QUEUE_DRIVER=inline`.

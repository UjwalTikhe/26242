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

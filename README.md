# Deerwood Bank CRM

Internal full-stack CRM for Deerwood Bank sales teams to manage leads, contacts, and rep activity.

## Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS 3
- Backend: Azure Functions v4 (Node.js + TypeScript)
- Database: PostgreSQL with Prisma ORM
- Authentication: Microsoft Entra ID (MSAL in frontend, JWT validation in API)

## Project Structure

- `apps/web`: React UI with Entra login, protected routes, and CRM layout
- `apps/api`: Azure Functions HTTP API with Entra JWT middleware and Prisma access
- `prisma/schema.prisma`: Shared relational schema for users, leads, contacts, and activities
- `.env.example`: Required environment values for local development

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL (local or remote)
- Azure Functions Core Tools v4

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env values:
   - `copy .env.example .env`
3. Update `.env` with your Azure app registration and local database credentials.
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Run your first migration:
   - `npm run prisma:migrate -- --name init`

## Run Locally

Use two terminals:

1. Frontend:
   - `npm run dev:web`
2. API:
   - `npm run dev:api`

Frontend runs on `http://localhost:5173` and API on `http://localhost:7071`.

## Auth Notes

- Frontend MSAL config lives in `apps/web/src/auth/msalConfig.ts`.
- API validates bearer tokens against Microsoft JWKS for your tenant in `apps/api/src/middleware/auth.ts`.
- API also maps the authenticated Entra user to a CRM user in the `User` table and applies role context.

## API Routes

- `GET /api/health`
- `GET|POST /api/leads` (supports pagination, filtering, sorting)
- `GET|PUT /api/leads/{id}`
- `DELETE /api/leads/{id}` — **soft archive** (sets status to `DORMANT`; does not remove the row). Response: `{ "action": "archived", "lead": { ... } }`.
- `POST /api/leads/{id}/ai-brief` — AI pre-call brief from **internal** CRM data only (requires `ZHIPU_API_KEY` or `ANTHROPIC_API_KEY`)
- `POST /api/leads/{id}/activities`
- `GET|POST /api/leads/{leadId}/documents` (per-prospect files; `POST` is multipart)
- `GET /api/leads/{leadId}/documents/{documentId}/download` (auth-required; streams file)
- `DELETE /api/leads/{leadId}/documents/{documentId}`
- `POST /api/imports/leads/preview` (multipart `.xlsx` → column headers + sample rows)
- `POST /api/imports/leads/execute` (JSON: `previewId`, `mapping`, `assignedToId`)
- `GET /api/imports/jobs` (recent import audit rows for the current user)
- `GET|POST /api/contacts`
- `GET|PUT|DELETE /api/contacts/{id}`
- `GET|POST /api/activities`
- `GET|PUT|DELETE /api/activities/{id}`
- `GET /api/users`
- `POST /api/search` (natural language → Prisma filters; **Zhipu GLM** if `ZHIPU_API_KEY` is set, else Anthropic)
- `GET /api/dashboard/stats`
- `GET /api/dashboard/pipeline`
- `GET /api/dashboard/leaderboard?period=week|month|quarter`
- `GET /api/dashboard/feed?limit=20`
- `GET /api/dashboard/stale-leads?days=14`
- `GET /api/dashboard/follow-ups`
- `GET /api/emails/sync-status`
- `POST /api/emails/manual-sync`
- `GET /api/notifications`
- `PUT /api/notifications/{id}/read`
- `PUT /api/notifications/read-all`
- `GET /api/notifications/count`
- `GET|POST /api/automations`
- `PUT|DELETE /api/automations/{id}`
- `GET /api/automations/{id}/logs`
- `GET|POST /api/ticklers` (list with filter=overdue|today|upcoming|completed; create)
- `GET|PUT|DELETE /api/ticklers/{id}`
- `POST /api/ticklers/{id}/complete` (marks done; spawns next occurrence if recurring)
- `POST /api/ticklers/{id}/snooze` (JSON: `{ until }`)
- `GET /api/reports/pipeline-by-officer?branch=`
- `GET /api/reports/conversion?days=90&branch=`
- `GET /api/reports/activity-volume?days=30&branch=`
- `GET /api/reports/stale-leads?days=14&branch=`
- `GET /api/map/leads` (geocoded leads as markers)
- `POST /api/map/geocode` (batch geocode up to 50 ungeooded leads via Nominatim)

## Excel import (Phase 3)

- Preview stores a temp file under `LOCAL_IMPORT_TEMP_DIR` (default: `apps/api/.import-temp`). Previews older than 48h are deleted on the next preview.
- Limits: `MAX_IMPORT_PREVIEW_BYTES` (default 5 MB), `MAX_IMPORT_ROWS` (default 500). No automation triggers on bulk-created leads (same as manual create would fire — skipped here for performance).

## Lead documents (Phase 2)

- **Local dev:** Without Azure, files are stored under `LOCAL_DOCUMENT_STORAGE_DIR` (default: `apps/api/.local-document-storage` relative to the Functions process cwd) or override with that env var.
- **Production:** Set `AZURE_STORAGE_CONNECTION_STRING` and optionally `AZURE_STORAGE_CONTAINER` (default `lead-documents`). Optional `MAX_UPLOAD_BYTES` (default 15 MB).
- Allowed MIME types: PDF, common Office, CSV, images (see `lead-documents.ts`).

## AI Search & prep brief

- Set **`ZHIPU_API_KEY`** (and optional `ZHIPU_MODEL`, default `glm-4.7-flash`) and/or **`ANTHROPIC_API_KEY`** in repo root `.env` and/or `apps/api/local.settings.json` (Azure Functions loads both via `loadEnv` + host settings).
- `POST /api/search` converts natural language to Prisma filters; results are always scoped by role on the server.
- `POST /api/leads/{id}/ai-brief` generates a lender prep brief from lead + activities + contacts + document metadata only (no web enrichment).

## Outlook + Automation Setup

- Configure Graph app credentials in `.env`: `AZURE_CLIENT_SECRET`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`.
- Email sync timer runs every 15 minutes and creates deduplicated `EMAIL` activities using only body previews (500 chars).
- Automation engine timer runs every 5 minutes, processes active timer-based rules, and writes audit logs.
- Run schema migration before using automation/notification/email-sync features:
  - `npm run prisma:migrate -- --name prompt4_automation_email`
  - `npm run prisma:seed`

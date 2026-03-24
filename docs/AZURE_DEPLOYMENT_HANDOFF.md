# Azure deployment handoff — Deerwood Bank CRM (Bank_CRM)

Give this document to another assistant to provision Azure, wire CI/CD, and configure Entra ID. It describes **this repository’s** architecture, env vars, build steps, and production rules.

---

## 1. Repository summary

| Layer | Path | Technology |
|-------|------|------------|
| Frontend | `apps/web` | React 18, TypeScript, Vite 8, Tailwind, MSAL (`@azure/msal-browser`) |
| Backend | `apps/api` | Azure Functions **v4** programming model (Node.js, TypeScript), HTTP triggers registered in code (no `function.json` files) |
| Database | `prisma/` | PostgreSQL via **Prisma ORM**; migrations in `prisma/migrations/` |
| Workspace | repo root | npm **workspaces** (`apps/*`); root `package.json` runs combined builds |

**HTTP route prefix:** All Functions HTTP routes are under **`/api`** (see `apps/api/host.json` → `routePrefix: "api"`).

**Local dev URLs:** Web `http://localhost:5173`, API `http://localhost:7071`, full API base `http://localhost:7071/api`.

---

## 2. Target Azure architecture (recommended)

Deploy as **three managed pieces** plus optional storage:

1. **Azure Database for PostgreSQL — Flexible Server**  
   - Holds application data.  
   - Connection string → `DATABASE_URL` for the Function App.

2. **Azure Function App** (Node.js **20**, **Linux**)  
   - Hosts `apps/api` after TypeScript build.  
   - Must run `prisma generate` (and migrations via pipeline or manual step).  
   - Application Insights recommended.

3. **Static frontend** (choose one)  
   - **Azure Static Web Apps** (simple CI/CD from GitHub), or  
   - **Storage Account** static website + **Azure CDN / Front Door** (more manual).

4. **Optional — Azure Blob Storage**  
   - For lead document uploads in production.  
   - If not configured, API falls back to **local filesystem** under the Function App (not durable across instances / restarts — **set Blob for production**).

5. **Optional — Azure Key Vault**  
   - Store secrets; reference from Function App / pipeline as `@Microsoft.KeyVault(...)`.

---

## 3. Authentication model (Microsoft Entra ID)

### Browser (MSAL)

- Config: `apps/web/src/auth/msalConfig.ts`  
- **`redirectUri`**: `window.location.origin` → must match the **exact** HTTPS origin of the deployed SPA (e.g. `https://your-app.azurestaticapps.net`).  
- **Authority**: `https://login.microsoftonline.com/{TENANT_ID}`  
- **Login scopes**: `User.Read`, `openid`, `profile`, `email`  
- **API token scopes**: `api://{VITE_AZURE_CLIENT_ID}/access_as_user` — this requires an **Exposed API** scope named `access_as_user` on the **same** app registration (or a separate resource app; this repo assumes **one** client id for SPA + API audience pattern).

### API (JWT validation)

- File: `apps/api/src/middleware/auth.ts`  
- Validates JWT against Microsoft JWKS:  
  `https://login.microsoftonline.com/{AZURE_TENANT_ID}/discovery/v2.0/keys`  
- Env: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` (API app id as expected by token `aud` — align with how you register the API).

### Dev bypass (NOT for bank production)

- When `DEV_AUTH_BYPASS=true` **and** `NODE_ENV !== production`**, API accepts `Authorization: Bearer __dev_bypass__` plus header **`X-Dev-User-Id`** (a UUID from the `User` table).  
- Web: `VITE_DEV_AUTH_BYPASS=true` shows seeded user picker.  
- **Production:** set `NODE_ENV=production`, **`DEV_AUTH_BYPASS=false`** (or unset), **`VITE_DEV_AUTH_BYPASS=false`** at **build time** for the web app.

### Microsoft Graph (email sync)

- Uses `AZURE_CLIENT_SECRET`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` (see `.env.example`).  
- Only needed if email sync / Graph features are required.

---

## 4. CORS (critical)

- File: `apps/api/src/middleware/auth.ts` — `corsHeaders()`  
- **`Access-Control-Allow-Origin`** is a **single** value: `process.env.ALLOWED_ORIGIN` or default `http://localhost:5173`.  
- **Production:** set `ALLOWED_ORIGIN` to the SPA’s **origin only** (scheme + host + port if any), **no path**, e.g. `https://your-app.azurestaticapps.net`.  
- **Must match** the URL your mother’s browser uses to load the React app, or the browser will block API calls.

Allowed headers include: `Content-Type`, `Authorization`, `X-Dev-User-Id`.

---

## 5. Environment variables (complete checklist)

### 5.1 Function App (backend) — application settings

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `NODE_ENV` | `production` |
| `AZURE_TENANT_ID` | Entra tenant GUID |
| `AZURE_CLIENT_ID` | App registration client ID used for API JWT validation |
| `ALLOWED_ORIGIN` | SPA origin for CORS (see §4) |
| `DEV_AUTH_BYPASS` | `false` in production |
| `ANTHROPIC_API_KEY` | Optional; AI if no Zhipu |
| `ZHIPU_API_KEY` | Optional; AI search + prep brief (preferred when set) |
| `ZHIPU_MODEL` | Optional; model id (code default is `glm-4-flash`-style; confirm in `apps/api/src/services/llm.ts`) |
| `ZHIPU_API_BASE_URL` | Optional; override Zhipu chat completions URL (default in code targets official BigModel endpoint) |
| `AZURE_CLIENT_SECRET` | Graph client secret (if using email sync) |
| `GRAPH_TENANT_ID` | Often same as tenant |
| `GRAPH_CLIENT_ID` | Graph app id |
| `AZURE_STORAGE_CONNECTION_STRING` | **Recommended** for documents |
| `AZURE_STORAGE_CONTAINER` | Optional; default `lead-documents` |
| `MAX_UPLOAD_BYTES` | Optional; default ~15 MB |
| `LOCAL_DOCUMENT_STORAGE_DIR` | Fallback local path (avoid in multi-instance prod) |
| `LOCAL_IMPORT_TEMP_DIR` | Temp dir for Excel import preview on disk (Functions may need writable path; default under cwd) |
| `MAX_IMPORT_ROWS` | Optional; default 500 |
| `MAX_IMPORT_PREVIEW_BYTES` | Optional; default 5 MB |

**Note:** Local dev loads repo-root `.env` via `apps/api/src/loadEnv.ts` (dotenv path relative to **compiled** `dist/src`). In Azure, rely on **Application Settings**, not `.env` files.

### 5.2 Static web build (frontend) — build-time (`VITE_*`)

Set these when running `npm run build` (Vite embeds them in the bundle):

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Public URL of API **including** `/api` suffix, e.g. `https://YOUR-FUNCTION-APP.azurewebsites.net/api` |
| `VITE_AZURE_CLIENT_ID` | Entra app (SPA) client id |
| `VITE_AZURE_TENANT_ID` | Entra tenant id |
| `VITE_DEV_AUTH_BYPASS` | `false` for real bank login |

`apps/web/vite.config.ts` sets `envDir` to **repo root**, so root `.env` / CI env vars are picked up during `vite build` if present.

### 5.3 Reference template

See repo **[`.env.example`](../../.env.example)** for names and comments.

---

## 6. Build and deploy commands (from repository root)

Prerequisites: Node **20+**, npm **10+**.

```bash
npm install
npm run prisma:generate
npm run build
```

- **`npm run build`** (root) runs: `npm run build -w web && npm run build -w api`  
  - Web: `tsc -b && vite build` → output **`apps/web/dist`**  
  - API: `tsc -p apps/api/tsconfig.json` → output **`apps/api/dist`**

### Database migrations (against Azure Postgres)

Use **deploy**, not `migrate dev`:

```bash
# DATABASE_URL pointing at Azure Postgres
npx prisma migrate deploy
```

Run from repo root (where `prisma/schema.prisma` lives). Seed is optional:

```bash
npm run prisma:seed
```

---

## 7. Azure Function App packaging notes

- Entry: `apps/api/package.json` → `"main": "dist/src/index.js"`  
- Functions are registered by **importing** side-effect modules from `apps/api/src/index.ts` (each `functions/*.ts` calls `app.http(...)`).  
- Deploy the **api** app folder contents appropriate for `func azure functionapp publish` (include `host.json`, `package.json`, `dist/`, **production `node_modules`**, and Prisma artifacts as required).

**Prisma on Azure Functions:** Ensure the deployed package includes:

- Generated Prisma Client (`prisma generate` output, usually under `node_modules/.prisma` and `@prisma/client`)  
- `prisma/schema.prisma` if runtime needs it (typically client only after generate)  
- Migrations are **not** always required at runtime if you only run `migrate deploy` in CI — but the pipeline must run migrations before or right after deploy.

Exact folder layout depends on whether you publish from `apps/api` only or use a custom build that copies root `node_modules` — **the assisting LLM should design the CI step to match Azure’s Node Functions layout** (often `npm install --production` in `apps/api` after copying prisma schema or hoisting from root).

---

## 8. API surface (for APIM / WAF / testing)

Base URL: `https://<function-app>.azurewebsites.net/api` (or custom domain).

Notable routes (non-exhaustive — see **[README.md](../../README.md)**):

- `GET /api/health`  
- `GET|POST /api/leads`, `GET|PUT|DELETE /api/leads/{id}`  
- `POST /api/leads/{id}/ai-brief`  
- `GET|POST /api/contacts`, documents, imports, dashboard, search, automations, ticklers, reports, map, email sync, notifications, users, etc.

---

## 9. Entra app registration checklist (SPA + API)

1. Register app; enable **SPA** platform redirect URIs for production origin + localhost for dev.  
2. **Expose an API**: scope `access_as_user` (or match `apiScopes` in `msalConfig.ts`).  
3. **Authorize** the SPA client to request that scope.  
4. Ensure tokens issued for the API use `aud` / issuer that **`auth.ts`** expects (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`).  
5. If using Graph: grant application permissions / delegated as required; store secret in Key Vault.

---

## 10. Optional features and external services

- **Lead documents:** Blob Storage strongly recommended in Azure.  
- **Excel import:** Uses temp files (`LOCAL_IMPORT_TEMP_DIR`); on Consumption plan, filesystem is limited — consider Premium plan or adjust temp strategy if imports fail.  
- **Map geocoding:** `POST /api/map/geocode` uses **Nominatim** (external); respect usage policy.  
- **AI:** Zhipu and/or Anthropic keys in Function App settings.  
- **Timers:** `email-sync` and `automation-engine` use Azure Functions **timer triggers** — ensure they are enabled in the deployed app.

---

## 11. Security checklist before “bank” demo

- [ ] `NODE_ENV=production`  
- [ ] `DEV_AUTH_BYPASS` not true  
- [ ] `VITE_DEV_AUTH_BYPASS` not true in production build  
- [ ] `ALLOWED_ORIGIN` = exact production SPA origin  
- [ ] `DATABASE_URL` not in git; use Key Vault / app settings  
- [ ] API keys only in app settings / Key Vault  
- [ ] Postgres firewall / private access configured  
- [ ] HTTPS only on SPA and API  
- [ ] Review `README.md` delete semantics: `DELETE /api/leads/{id}` **archives** (status `DORMANT`), does not hard-delete rows  

---

## 12. GitHub / CI expectations

The repo may not yet include Bicep or GitHub Actions; the assisting LLM should add:

- Workflow: install → `prisma generate` → `npm run build` → deploy **api** (Azure Functions) and **web** (Static Web Apps or Storage).  
- Step: `prisma migrate deploy` with `DATABASE_URL` secret against Azure Postgres.  
- Secrets: `AZURE_CREDENTIALS` or OIDC federated identity for Azure login.

---

## 13. Quick reference — repo paths

| Item | Path |
|------|------|
| Prisma schema | `prisma/schema.prisma` |
| Seed | `prisma/seed.ts` |
| API host config | `apps/api/host.json` |
| CORS / JWT | `apps/api/src/middleware/auth.ts` |
| LLM / Zhipu | `apps/api/src/services/llm.ts` |
| Blob storage | `apps/api/src/services/storage.ts` |
| MSAL | `apps/web/src/auth/msalConfig.ts` |
| API client base URL | `apps/web/src/lib/api.ts` (`VITE_API_URL`) |

---

*Document generated for handoff; adjust Azure SKUs and networking to the bank’s compliance requirements.*

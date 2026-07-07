# What's Next? Technical Overview

Last updated: 2026-07-04

## Purpose

What's Next? is a full-stack personal productivity workspace. It centralizes daily work across tasks, ticket-backed work, projects, notes, knowledge articles, SQL snippets, files, calendar events, time tracking, analytics, notifications, and grounded AI assistance.

The application is designed as a private authenticated workspace first. Users must sign in before any workspace data is loaded, and the client does not keep a browser-local source of truth for workspace records.

## Runtime Topology

```text
Browser
  |
  | Next.js app, cookie credentials, optional bearer token after login
  v
NestJS API at /api
  |
  | Prisma ORM
  v
PostgreSQL

NestJS also integrates with:
  - Cloudflare R2 for file and backup object storage
  - Resend for password reset, summary, reminder, and error alert emails
  - Groq and Puter for AI provider calls
  - Google Identity token verification for Google sign-in
```

## Root Structure

```text
client/  Next.js app, UI components, frontend tests, frontend package files
server/  NestJS API, Prisma schema and migrations, backend tests, backend package files
docs/    Product, technical, setup, storage, AI, status, and audit documentation
```

There is intentionally no root `package.json` or root `node_modules`. Each app owns its own dependencies.

## Frontend Architecture

The frontend lives in `client/` and uses:

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- shadcn-style local primitives.
- Framer Motion.
- React Query provider.
- Cookie-backed authenticated API calls.

Important entry points:

| Path | Responsibility |
| --- | --- |
| `client/app/layout.tsx` | App metadata, Inter font, global providers |
| `client/app/page.tsx` | Protected default workspace route |
| `client/app/[module]/page.tsx` | Protected route-per-module workspace pages |
| `client/lib/auth/auth-context.tsx` | Auth bootstrap, login/register/logout state |
| `client/lib/workspace/*-api.ts` | Typed API wrappers for backend modules |
| `client/lib/workspace/use-workspace-store.ts` | In-memory workspace cache and derived metrics |
| `client/components/layout/workspace-shell.tsx` | Sidebar, top bar, command palette, notifications |
| `client/components/workspace/product-workspace.tsx` | Main authenticated product surface and module orchestration |

The main workspace component loads data from backend APIs into the in-memory store. UI modules render from that store and write changes back through typed API wrappers.

## Backend Architecture

The backend lives in `server/` and uses:

- NestJS feature modules.
- Prisma ORM.
- PostgreSQL.
- JWT sessions stored in `AuthSession`.
- Argon2 password hashing.
- Global DTO validation.
- Global exception handling.
- Rate limiting.
- Structured API flow logging.

Important entry points:

| Path | Responsibility |
| --- | --- |
| `server/src/main.ts` | Nest bootstrap, `/api` prefix, CORS, body limits, Helmet, validation |
| `server/src/app.module.ts` | Module graph, throttling, global logging and exception providers |
| `server/src/auth/*` | Email/password auth, Google auth, password reset, logout, session validation |
| `server/src/common/logging/*` | Request IDs, API flow tracing, persisted request logs, daily JSONL logs |
| `server/src/prisma/*` | Prisma service and DB query instrumentation |
| `server/prisma/schema.prisma` | Relational schema |
| `server/prisma/migrations/*` | Database migrations |

## Backend Modules

| Module | Main routes | Notes |
| --- | --- | --- |
| Auth | `POST /api/auth/register`, `login`, `google`, `forgot-password`, `reset-password`, `logout` | Issues JWT, stores session, sets HttpOnly cookie |
| Users | `GET/PATCH /api/users/me`, sessions, password change, logout all | Profile and security settings |
| Workspaces | `GET/POST/PATCH/DELETE /api/workspaces` | Workspace listing, creation, update, archive |
| Tasks | `GET/POST/PATCH /api/tasks`, `PATCH /api/tasks/:id/status` | Tasks and ticket-backed task records |
| Tickets | `GET/POST /api/tickets` | Legacy/compat ticket API, product flow now uses task-backed tickets |
| Projects | `GET/POST/PATCH/DELETE /api/projects` | Project cards, details, archive, unarchive |
| Notes | `GET/POST/PATCH /api/notes` | Notes, version history, backlinks |
| Articles | `GET/POST/PATCH /api/articles` | Knowledge base articles |
| SQL | `GET/POST/PATCH /api/sql` | SQL snippets and metadata |
| Files | `GET /api/files`, `POST /api/files/upload`, update, delete, storage usage | R2 upload and metadata |
| Calendar | `GET/POST/PATCH/DELETE /api/calendar` | Events and reminders |
| Time | `GET /api/time`, start, manual, toggle, stop | Exact second-level focus tracking |
| Templates | `GET/POST/PATCH /api/templates` | Email/content templates and favorites |
| Search | `GET /api/search` | Cross-module global search |
| Analytics | `GET /api/analytics/dashboard` | Dashboard metrics and activity charts |
| AI | `POST /api/ai/suggest`, `POST /api/ai/ask` | Provider-backed and grounded workspace AI |
| Notifications | `GET /api/notifications`, daily summary, deadline reminders | In-app and email notification flows |
| Health | `GET /api/health` | Basic health check |

## Database Model

Primary model groups:

- Identity: `User`, `AuthSession`.
- Workspace ownership: `Workspace`, `WorkspaceMember`.
- Work management: `Project`, `Milestone`, `Task`, `TaskDependency`, `Ticket`.
- Knowledge: `Note`, `NoteVersion`, `NoteLink`, `KnowledgeArticle`, `SqlSnippet`.
- Files and schedule: `FileAsset`, `CalendarEvent`, `TimeEntry`.
- Operational records: `Template`, `Comment`, `Notification`, `AiMessage`, `AuditLog`, `ApiRequestLog`.

Most product records use UUID ids, timestamps, and soft-delete fields where the product needs recoverable deletes.

## Authentication And Authorization

1. Register/login validates credentials.
2. Backend creates an `AuthSession`.
3. Backend signs a JWT containing `sub`, `email`, `name`, and `sid`.
4. Backend returns the token and sets an HttpOnly `whats_next_access_token` cookie.
5. Guarded routes accept either the cookie token or an Authorization bearer token.
6. JWT validation checks token expiry and confirms the session is active and unrevoked in PostgreSQL.
7. Logout revokes the current session and clears auth state.
8. Password reset revokes active sessions after changing the password.

Workspace authorization is enforced by checking `WorkspaceMember` records before workspace-scoped reads and writes.

## AI Architecture

The AI layer supports:

- Generic assistant suggestions.
- Grounded workspace questions.
- Workflow prompts for notes, tickets, SQL, RCA, email drafts, daily summaries, and weekly summaries.

Provider modes:

```env
AI_PROVIDER="auto"
AI_AUTO_PROVIDER_ORDER="puter,groq"
```

In auto mode, the backend follows `AI_AUTO_PROVIDER_ORDER`.

For Puter, the backend checks monthly usage before calling `puter.ai.chat`:

```env
PUTER_USAGE_GUARD_ENABLED="true"
PUTER_USAGE_MAX_PERCENT="80"
PUTER_USAGE_MIN_REMAINING="1000000"
PUTER_USAGE_CACHE_SECONDS="300"
PUTER_USAGE_GUARD_FAIL_OPEN="false"
```

If Puter is over threshold or usage cannot be verified, the backend skips Puter and tries the next provider, normally Groq.

Grounded AI asks:

1. Validate workspace membership.
2. Parse user intent.
3. Retrieve matching tasks, ticket-backed tasks, tickets, notes, articles, SQL snippets, files, and time entries.
4. Build a request-time normalized search index.
5. Score and narrow sources.
6. Use deterministic templates for structured questions when possible.
7. Otherwise send source evidence and the user question to the configured AI provider.
8. Return direct answer content plus clickable source cards.

## File Storage

Uploads go through the backend and are stored in Cloudflare R2. The frontend avoids showing raw object paths to users.

Object layout:

```text
workspaces/{workspaceId}/files/{yyyy}/{mm}/{dd}/{entityType}/{entityId-or-unassigned}/{uploadId}/{fileName}
workspaces/{workspaceId}/files/{yyyy}/{mm}/{dd}/workspace/{uploadId}/{fileName}
workspaces/{workspaceId}/profiles/{userId}/avatars/{yyyy}/{mm}/{dd}/{uploadId}/{fileName}
workspaces/{workspaceId}/backups/{yyyy}/{mm}/{dd}/{uploadId}/{fileName}
```

The backend records file metadata in `FileAsset`, audits create/update/delete operations, and exposes authenticated `/api/files/{id}/content` streaming so the UI does not need to render private R2 object URLs directly.

Workspace backups are uploaded as JSON `Backup` file assets. The Settings page lists those saved restore points, lets the user create a manual backup, and can restore from a selected backup through `POST /api/files/{id}/restore`. Restore is transactional: it validates workspace access, reads the JSON object from R2, replaces workspace records in PostgreSQL, relinks file assets where possible, and writes an audit log entry. Automatic backups are client-scheduled while the authenticated app is open, with 12-hour, 24-hour, or off settings.

## Observability

Each API request gets:

- Request ID.
- Compact console log.
- Persisted `ApiRequestLog` row.
- Daily JSONL log file, for example `server/logs/2026-07-04_api-flow.log`.
- Sanitized request, response, error, and flow trace.
- Controller, service, database, AI provider, and error flow steps where applicable.
- Optional Resend email alert for configured admin recipients on errors.

Secrets, cookies, tokens, API keys, passwords, and large payloads are sanitized before persistence.

## Configuration

Environment files live under each app:

```text
client/.env.local
server/.env
```

Example templates:

```text
client/.env.example
server/.env.example
```

The project intentionally avoids root-level package and env files.

## Verification Commands

Run from `server/`:

```bash
npm run test
npm run build
```

Run from `client/`:

```bash
npm run test
npm run build
npm run test:e2e
```

E2E tests require the server and client to be running and a prepared local PostgreSQL database.

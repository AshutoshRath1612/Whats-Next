# What's Next?

Plan. Focus. Achieve.

What's Next? is an authenticated all-in-one productivity workspace for tasks, projects, ticket-backed work, notes, knowledge articles, SQL snippets, files, calendar events, time tracking, analytics, notifications, and grounded AI assistance.

The app is split into two independent packages:

```text
client/  Next.js frontend
server/  NestJS API and Prisma backend
docs/    Technical, flow, setup, status, storage, AI, and audit docs
```

There is intentionally no root `package.json` and no root `node_modules`.

## Current Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn-style components, Framer Motion, React Query.
- Backend: NestJS, Prisma, PostgreSQL, JWT sessions, Argon2 password hashing.
- Storage: Cloudflare R2 for uploaded files and backups.
- Email: Resend for password reset, summaries, reminders, and admin error alerts.
- AI: Puter and Groq in automatic fallback mode, with optional OpenAI-compatible support.
- Logs: request-id based API flow logs in PostgreSQL plus daily JSONL files.

## Requirements

- Node.js 20+
- npm
- PostgreSQL installed locally
- Cloudflare R2 credentials if file uploads/backups are needed
- Resend credentials if email flows are needed
- Groq and/or Puter credentials if AI is needed

## Environment Setup

Create local env files from the examples:

```bash
cp client/.env.example client/.env.local
cp server/.env.example server/.env
```

Update `server/.env` for your local PostgreSQL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/whats_next?schema=public"
```

The server currently expects local PostgreSQL. Create the database if it does not exist:

```bash
createdb whats_next
```

If your local user/password/database differs, update `DATABASE_URL`.

## Install Dependencies

Install dependencies separately:

```bash
cd server
npm install

cd ../client
npm install
```

## Prepare Database

Run from `server/`:

```bash
npm run db:generate
npx prisma migrate deploy
npm run db:seed
```

The seed command is intentionally a no-op. Users create real accounts and workspaces through the app.

## Run Locally

Terminal 1:

```bash
cd server
npm run start:dev
```

Terminal 2:

```bash
cd client
npm run dev
```

Open:

```text
http://localhost:3000
```

API base:

```text
http://localhost:4000/api
```

## AI Configuration

For personal use, the current recommended mode is:

```env
AI_PROVIDER="auto"
AI_AUTO_PROVIDER_ORDER="puter,groq"

GROQ_API_KEY="..."
GROQ_BASE_URL="https://api.groq.com/openai/v1"
GROQ_MODEL="llama-3.1-8b-instant"

PUTER_AUTH_TOKEN="..."
PUTER_MODEL="gpt-5.4-mini"
PUTER_USAGE_GUARD_ENABLED="true"
PUTER_USAGE_MAX_PERCENT="80"
PUTER_USAGE_MIN_REMAINING="1000000"
PUTER_USAGE_CACHE_SECONDS="300"
PUTER_USAGE_GUARD_FAIL_OPEN="false"
```

Behavior:

```text
AI request
  -> Try Puter if monthly usage is under threshold
  -> Skip Puter when threshold is reached or usage cannot be verified
  -> Fall back to Groq
```

Provider decisions are logged in the API flow logs.

## Storage Configuration

File uploads, backups, and restores require:

```env
CLOUDFLARE_R2_ACCOUNT_ID=""
CLOUDFLARE_R2_ACCESS_KEY_ID=""
CLOUDFLARE_R2_SECRET_ACCESS_KEY=""
CLOUDFLARE_R2_BUCKET=""
```

Upload limits:

```env
REQUEST_BODY_LIMIT="100mb"
FILE_UPLOAD_MAX_BYTES="50mb"
```

The Settings page can create manual workspace backups, list previous backup restore points, and restore a workspace from a selected JSON backup. Automatic backups run from the authenticated app while the workspace is open and can be set to every 12 hours, every 24 hours, or off.

The object layout is documented in [docs/STORAGE.md](docs/STORAGE.md).

## Email Configuration

Password reset, reminders, summaries, and admin error alerts use Resend:

```env
RESEND_API_KEY=""
EMAIL_FROM="What's Next? <noreply@example.com>"
ENABLE_SCHEDULED_NOTIFICATIONS="false"
SCHEDULED_DAILY_SUMMARY_HOUR="8"
SCHEDULED_REMINDER_INTERVAL_MINUTES="60"
ADMIN_ERROR_ALERT_EMAIL=""
ERROR_ALERT_ENABLED="true"
```

Email rendering uses shared branded templates with both HTML and plain-text fallbacks for password reset, AI-written daily summaries, deadline reminders, and admin error alerts.

Details are documented in [docs/EMAIL_AND_AI.md](docs/EMAIL_AND_AI.md).

## Logging

Every API request is logged with:

- Request ID
- User/workspace context
- Controller and handler
- Sanitized request and response
- Controller, service, database, and AI flow steps
- Error details when applicable

Daily JSONL logs are written under `server/logs/`:

```text
server/logs/YYYY-MM-DD_api-flow.log
```

Example:

```text
server/logs/2026-07-04_api-flow.log
```

## Test And Build

Server:

```bash
cd server
npm run test
npm run build
```

Client:

```bash
cd client
npm run test
npm run build
```

E2E:

```bash
cd client
npm run test:e2e:install
npm run test:e2e
```

E2E tests require the server and client to be running and PostgreSQL to be prepared.

## Documentation

- [Technical overview](docs/TECHNICAL_OVERVIEW.md)
- [Application flow](docs/APPLICATION_FLOW.md)
- [Audit findings](docs/AUDIT_FINDINGS.md)
- [Implementation status](docs/STATUS.md)
- [Feature checklist](docs/FEATURE_TODO.md)
- [Bug history](docs/bugs.txt)
- [Storage layout](docs/STORAGE.md)
- [Email and AI setup](docs/EMAIL_AND_AI.md)

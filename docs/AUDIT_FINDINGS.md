# What's Next? End-to-End Audit Findings

Last updated: 2026-07-04

## Scope

This pass reviewed the current project structure, frontend shell, backend modules, Prisma schema, existing status/todo/bug documents, environment examples, logging setup, storage setup, AI provider behavior, and the remaining `infra/` folder.

## Result

No blocker-level application bugs were found in the audited source. The current documented bug tracker says there are no open bugs, and the main server test/build path passes after this pass.

This audit did find a few project hygiene and production-readiness issues. Some were fixed immediately; the rest are listed as known considerations.

## Fixed In This Pass

1. Removed stale infrastructure compose file.

   `infra/docker-compose.yml` only provided optional Docker orchestration for Postgres, server, and client. It was stale relative to the current local-Postgres setup and did not represent the current AI/R2/email environment surface. The file was removed and the empty `infra/` directory was removed.

2. Sanitized checked-in environment examples.

   `server/.env.example` and `client/.env.example` no longer contain project-specific Google or Cloudflare R2 credential-looking values. They now use empty placeholders.

3. Tightened `.gitignore`.

   Local env files, logs, build outputs, Playwright artifacts, and test result folders are now ignored.

4. Added root README.

   The root now has a setup and operations guide without adding root package files.

5. Added technical and flow documentation.

   Added `docs/TECHNICAL_OVERVIEW.md` and `docs/APPLICATION_FLOW.md`.

6. Updated stale docs that referenced `infra/`.

   Setup/status documentation now reflects the active root layout.

## Current Root Layout

```text
client/
server/
docs/
README.md
.gitignore
```

`README.md` and `.gitignore` are intentional root-level project files. Package files remain inside `client/` and `server/`.

## Known Production Considerations

These are not current blocker bugs, but they are worth tracking before a public or multi-user hosted release.

### 1. Puter Uses A Server Account Token

Current Puter integration uses one backend `PUTER_AUTH_TOKEN`. That is good for personal hosted use and keeps RAG/logging server-side, but it means all Puter usage is charged against that one Puter account.

Mitigation already implemented:

- `AI_PROVIDER=auto`
- `AI_AUTO_PROVIDER_ORDER=puter,groq`
- Puter monthly usage guard
- Groq fallback after threshold

Future option:

- Add true browser-side Puter user-pays mode if multiple external users should pay for their own AI usage.

### 2. File Uploads Use Base64 JSON

Uploads currently go through `POST /api/files/upload` with base64 data in JSON. This is simpler and works with the configured body limits, but it is memory-heavy for large files.

Current mitigation:

- `REQUEST_BODY_LIMIT`
- `FILE_UPLOAD_MAX_BYTES`
- Clear oversized-file errors

Future option:

- Move to multipart upload or direct presigned R2 uploads for very large files.

### 3. R2 Download URL Model Needs Deployment Review

The frontend hides raw R2 paths from normal UI, but the backend stores a generated object URL in `FileAsset.url`. For production, bucket privacy and download behavior should be reviewed.

Future option:

- Use private buckets and signed download URLs from the backend instead of durable object URLs.

### 4. Google Token Verification Uses Tokeninfo Endpoint

Google sign-in currently verifies ID tokens by calling Google's `tokeninfo` endpoint and checking audience/email verification. This is functional, but production systems often use Google's official auth client and local certificate verification.

Future option:

- Replace tokeninfo fetch with an official Google auth library verifier.

### 5. Hardcoded Project Cover Presets

The project create flow still includes a small hardcoded list of Unsplash cover image presets. This does not affect persistence or backend data ownership, but it is a static UX preset.

Future option:

- Move cover presets into app assets, a settings table, or remove presets entirely.

### 6. `server` Development Script Is Not Watch Mode

`server/package.json` currently uses:

```bash
npm run start:dev
```

to build and start `dist`. It is reliable, but not a hot-reload development server.

Future option:

- Add a separate `dev` script using `nest start --watch`.

### 7. Scheduled Email Jobs Are Disabled By Default

Scheduled notifications are available but disabled by default.

Enable only after Resend is configured:

```env
ENABLE_SCHEDULED_NOTIFICATIONS="true"
```

## Verification Commands Used For This Audit

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
npm run test:e2e
```

Result:

- `server`: `npm run test` passed, 33/33.
- `server`: `npm run build` passed.
- `client`: `npm run test` passed, 7/7.
- `client`: `npm run build` passed.
- `client`: `npm run test:e2e` passed, 1/1.

The e2e suite self-started server/client test processes and used the prepared local PostgreSQL database.

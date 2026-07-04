# Email and AI Setup

## Resend Email

Email delivery uses the Resend API.

Where to get credentials:
- Create a Resend account.
- Verify a sending domain or use a verified sender allowed by Resend.
- Create an API key in the Resend dashboard.
- Put the API key and sender address in `server/.env`.

Configure these values in `server/.env`:

```env
RESEND_API_KEY=""
EMAIL_FROM="What's Next? <noreply@whatsnext.local>"
```

How email works:
- Forgot password creates a short-lived reset token and sends a reset link through Resend.
- Daily summary generates a workspace digest from backend data and emails it through Resend.
- Deadline reminders generate a reminder digest from backend data and email it through Resend.
- Resend configuration is required for email actions to succeed.
- Scheduled delivery requires `ENABLE_SCHEDULED_NOTIFICATIONS=true`.

## Admin Error Alerts

The backend records every API request in the `ApiRequestLog` table and sends an admin email when an API error is captured by the global exception filter.

Each request log is intended to be readable as an API story without opening the code. It includes:

- Request ID, method, path, matched route, controller, handler, user, workspace, IP, and user agent.
- Sanitized request query, route params, and body.
- Sanitized response body.
- A chronological `trace` timeline covering request receipt, controller entry/exit or failure, public application service workflow entry/exit/error steps, and Prisma database query steps with duration. Internal/private helpers and framework services are skipped.
- Console logs are compact and show a short request/response preview plus the application flow. The JSONL file and `ApiRequestLog` record keep the detailed sanitized payloads and timeline.
- HTTP status, total duration, error name/message/stack for failures, and timestamps.
- A daily JSONL file entry in `server/logs/YYYY-MM-DD_api-flow.log` by default, controlled by `API_LOG_FILE_ENABLED` and `API_LOG_FILE_PATH`.

Configure these values in `server/.env`:

```env
ADMIN_ERROR_ALERT_EMAIL="admin@example.com"
ERROR_ALERT_ENABLED="true"
ERROR_ALERT_MIN_STATUS="400"
ERROR_ALERT_COOLDOWN_SECONDS="60"
API_LOG_FILE_ENABLED="true"
API_LOG_FILE_PATH="logs/api-flow.log"
```

- `ADMIN_ERROR_ALERT_EMAIL` receives error alerts.
- `ERROR_ALERT_MIN_STATUS` controls which HTTP errors send email. The default `400` means all client and server errors are eligible.
- `ERROR_ALERT_COOLDOWN_SECONDS` prevents repeated identical errors from flooding the inbox.
- `API_LOG_FILE_ENABLED` writes one structured JSON line per API request when set to `true`.
- `API_LOG_FILE_PATH` is relative to the server process working directory unless an absolute path is provided. The backend prefixes the filename with the request date, so `logs/api-flow.log` writes to files like `logs/2026-07-04_api-flow.log`.
- Alerts use `RESEND_API_KEY` and `EMAIL_FROM`, so Resend must be configured.
- Request logs redact sensitive fields such as passwords, tokens, cookies, API keys, secrets, and large file payloads.

## Current AI Usage

AI can use OpenAI, Groq, Puter, or automatic fallback mode from `server/.env`. OpenAI and Groq use OpenAI-compatible chat-completion APIs. Puter uses the Puter.js Node runtime with `PUTER_AUTH_TOKEN`, which keeps AI calls inside the backend so request IDs, grounded RAG context, provider logs, and admin error alerts still work consistently.

```env
AI_PROVIDER="auto"
AI_AUTO_PROVIDER_ORDER="puter,groq"

OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o-mini"

GROQ_API_KEY=""
GROQ_BASE_URL="https://api.groq.com/openai/v1"
GROQ_MODEL="llama-3.1-8b-instant"

PUTER_AUTH_TOKEN=""
PUTER_MODEL="gpt-5.4-mini"
PUTER_USAGE_GUARD_ENABLED="true"
PUTER_USAGE_MAX_PERCENT="80"
PUTER_USAGE_MIN_REMAINING="1000000"
PUTER_USAGE_CACHE_SECONDS="300"
PUTER_USAGE_GUARD_FAIL_OPEN="false"
```

- `AI_PROVIDER=auto` uses `AI_AUTO_PROVIDER_ORDER`. For personal hosted use, `AI_AUTO_PROVIDER_ORDER=puter,groq` uses Puter first and Groq as the fallback.
- `AI_PROVIDER=openai` uses only OpenAI.
- `AI_PROVIDER=groq` uses only Groq.
- `AI_PROVIDER=puter` uses only Puter.
- `PUTER_USAGE_GUARD_ENABLED=true` checks Puter's monthly allowance before a Puter AI call.
- `PUTER_USAGE_MAX_PERCENT=80` skips Puter once at least 80% of the monthly allowance is used.
- `PUTER_USAGE_MIN_REMAINING=1000000` also skips Puter when remaining allowance falls to 1,000,000 units or less.
- `PUTER_USAGE_CACHE_SECONDS=300` caches Puter usage checks for five minutes to avoid checking on every request.
- `PUTER_USAGE_GUARD_FAIL_OPEN=false` means if Puter usage cannot be verified, the app protects the budget by skipping Puter and trying the next provider.
- Groq is OpenAI-compatible when using `GROQ_BASE_URL=https://api.groq.com/openai/v1`.
- Puter model names are controlled by `PUTER_MODEL`. Use Puter-supported names such as `gpt-5.4-mini` or a Claude model exposed by Puter.
- Puter also supports a browser user-pays flow, but this application intentionally uses the backend token flow so workspace data does not bypass the server-side audit trail.
- AI request logs include the selected provider chain and the provider that answered the call, including provider name, model, endpoint, status, and duration. The compact API log line includes `aiProvider=...` or `aiProviderFailed=...` for quick terminal debugging. API keys are never logged.

Current AI entry points:
- Dashboard AI Assistant card.
- Dashboard summarize action.
- Command palette AI search.
- Command palette daily-summary generation.
- Knowledge Base article analysis.
- Knowledge Base grounded workspace search, which retrieves matching database records and file metadata before answering.
- Workflow prompts for note summaries, ticket summaries, SQL explanations, RCA drafts, and professional email drafts.

AI receives summarized workspace context such as open tasks, ticket tasks, recent notes, SQL snippets, and tracked time. It does not directly mutate records; users review generated output and decide what to save.
Grounded workspace search only answers from retrieved workspace sources. If no relevant records are found, it returns an insufficient-information message without calling the AI provider.

# What's Next? Application Flow

Last updated: 2026-07-04

## 1. Application Startup

```text
User opens browser
  -> Next.js renders AppProviders
  -> AuthProvider calls GET /api/users/me with cookie credentials
  -> If valid, user enters the workspace shell
  -> If invalid, user is redirected to login
```

The app does not expose an unauthenticated workspace preview. Workspace data is loaded only after authentication succeeds.

## 2. Registration Flow

```text
Register form
  -> POST /api/auth/register
  -> AuthService checks unique email
  -> Password is hashed with Argon2
  -> User is created
  -> First workspace is created
  -> WorkspaceMember OWNER row is created
  -> AuthSession is created
  -> JWT is signed
  -> HttpOnly auth cookie is set
  -> Client loads the new workspace
```

The first workspace starts as `My Workspace` and can be renamed from onboarding or settings.

## 3. Login Flow

```text
Login form
  -> POST /api/auth/login
  -> AuthService verifies password hash
  -> AuthSession is created
  -> JWT is signed with session id
  -> HttpOnly cookie is set
  -> Client stores user in memory
  -> Workspace shell loads
```

Google login follows the same session issuing path after the backend verifies the Google ID token.

## 4. Session Validation Flow

```text
Guarded client route
  -> AuthProvider calls /api/users/me
  -> JwtStrategy reads token from cookie or bearer header
  -> JWT expiry is checked
  -> AuthSession sid is checked in PostgreSQL
  -> Revoked or expired sessions are rejected
```

Logout revokes the current session and clears client memory. Password reset revokes all active sessions for that user.

## 5. Workspace Shell Flow

```text
Authenticated user
  -> ProductWorkspace loads workspace list
  -> Active workspace is selected from URL or first backend workspace
  -> Workspace-scoped modules load data in parallel
  -> In-memory workspace store is populated
  -> Sidebar, dashboard, command palette, and modules render from loaded state
```

Workspace switching updates the active workspace id and reloads workspace-scoped records.

## 6. Navigation Flow

```text
Sidebar or command palette selection
  -> ProductWorkspace updates active module
  -> Router navigates to /{module-slug}?workspace={workspaceId}
  -> Module renders from the workspace store
```

Examples:

- `/tasks`
- `/projects`
- `/knowledge-base`
- `/sql-library`
- `/time-tracker`

Legacy `?view=` URLs normalize into route-per-module behavior.

## 7. Global Create Flow

```text
User clicks Create
  -> Create kind is inferred from active module
  -> Create dialog collects fields
  -> Frontend calls the matching backend API
  -> Backend validates DTO and workspace membership
  -> Prisma writes record
  -> Audit log is written for important mutations
  -> Frontend inserts mapped record into workspace store
  -> UI navigates or opens the new record where appropriate
```

The create dialog supports tasks, tickets, projects, notes, knowledge articles, SQL snippets, calendar events, and templates.

## 8. Task Flow

```text
Tasks page loads
  -> GET /api/tasks?workspaceId=...
  -> Backend verifies WorkspaceMember
  -> Tasks are mapped into client task records
  -> Details, Kanban, Calendar, and Timeline views render from the same data
```

Task updates:

```text
User edits task drawer or drags Kanban card
  -> Optimistic UI update
  -> PATCH /api/tasks/:id or PATCH /api/tasks/:id/status
  -> Backend verifies task belongs to accessible workspace
  -> Prisma updates Task
  -> AuditLog records the mutation
  -> Client reconciles mapped response
  -> On failure, optimistic state rolls back where implemented
```

Ticket work is represented as task-backed work with `workType: Ticket` and ticket-specific custom fields.

## 9. Project Flow

```text
Projects page
  -> GET /api/projects?workspaceId=...
  -> Cards show progress, pin state, archive state, icon, cover, and related task counts
  -> Project detail derives related tasks, notes, files, milestones, and activity
```

Project archive is soft-delete style hiding from active lists while preserving related work.

## 10. Notes Flow

```text
Notes page
  -> GET /api/notes?workspaceId=...
  -> User creates or edits note
  -> PATCH /api/notes/:id snapshots previous content into NoteVersion
  -> Client updates note editor, previews, backlinks, and version history
```

Backlinks are derived from `[[Wiki links]]` and shared note context.

## 11. Knowledge Base Flow

```text
Knowledge Base page
  -> GET /api/articles?workspaceId=...
  -> Articles show problem, root cause, resolution, tags, and references
  -> Related context is derived from references, tags, names, ticket numbers, and workspace records
```

Per-article Analyze:

```text
User clicks Analyze on article
  -> Client sends article and related context to AI endpoint
  -> Backend/provider returns analysis
  -> Article card renders loading, result, or error inline
```

Solved ticket tasks can be promoted into knowledge articles.

## 12. SQL Library Flow

```text
SQL Library
  -> GET /api/sql?workspaceId=...
  -> User creates or edits snippet metadata and query text
  -> Backend stores title, folder, tags, description, execution notes, query, favorite state
  -> Client supports search, tag filtering, copy, and local edit history UI
```

## 13. Files And R2 Flow

```text
User selects file
  -> Frontend reads bytes as base64 JSON payload
  -> POST /api/files/upload
  -> Backend validates workspace membership and file size
  -> Backend builds readable R2 key
  -> Backend signs R2 PUT request
  -> R2 stores object
  -> FileAsset row is created
  -> AuditLog records creation
  -> Client refreshes files and storage usage
```

Storage usage:

```text
GET /api/files/storage-usage
  -> Backend sums FileAsset sizes
  -> Backend scans R2 workspace prefix when configured
  -> Response uses the larger authoritative byte count
```

## 14. Calendar Flow

```text
Calendar module
  -> GET /api/calendar?workspaceId=...
  -> Events render in day, week, month, and agenda views
  -> Open task deadlines are merged into calendar views
  -> Event edits call PATCH /api/calendar/:id
  -> Event deletes call DELETE /api/calendar/:id
```

Browser reminder notifications are scheduled client-side when permission is granted.

## 15. Time Tracking Flow

```text
Start timer
  -> POST /api/time/start
  -> TimeEntry status RUNNING is created
  -> Client ticks exact seconds in UI

Pause/resume
  -> PATCH /api/time/:id/toggle
  -> Backend preserves elapsed seconds

Stop
  -> PATCH /api/time/:id/stop
  -> Backend stores durationSec and durationMin
  -> Dashboard, Time Tracker, task detail, and analytics use exact seconds
```

Manual entries also write to `TimeEntry` and can link to a task.

## 16. Search And Command Palette Flow

```text
Ctrl+K or command button
  -> Command palette opens
  -> Local commands and loaded workspace records appear immediately
  -> Query is debounced
  -> GET /api/search?workspaceId=...&q=...
  -> Backend searches primary collections
  -> Results merge with local commands
  -> Selection navigates or executes an action
```

Command actions include create task, start timer, copy template, daily summary, AI ask, theme toggle, and workspace switch.

## 17. AI Ask Flow

```text
User opens Ask AI
  -> POST /api/ai/ask
  -> Backend validates workspace access
  -> Question is normalized and intent-parsed
  -> Workspace records are retrieved
  -> Request-time search index scores records
  -> Deterministic answer template is used when possible
  -> Otherwise selected sources are sent to provider
  -> Response returns answer, provider metadata, and source cards
```

Auto provider mode:

```text
AI_PROVIDER=auto
AI_AUTO_PROVIDER_ORDER=puter,groq

For Puter:
  -> Check monthly allowance
  -> If under threshold, call Puter
  -> If over threshold or usage cannot be verified, skip Puter
  -> Try Groq
```

Logs include provider chain, usage guard decisions, provider used, model, endpoint/runtime, request id, and duration.

## 18. Analytics Flow

```text
Dashboard or Analytics page
  -> GET /api/analytics/dashboard?workspaceId=...
  -> Backend aggregates tasks, due dates, statuses, completed work, and time entries
  -> Client renders task health, weekly activity, progress, and time charts
```

Analytics works even when tasks are open, overdue, pending, or in progress, not only after completion.

## 19. Notification Flow

```text
Notification bell
  -> GET /api/notifications?workspaceId=...
  -> Backend returns due-date and timer notices
  -> Client merges backend notices with live local timer notices
```

Email flows:

- Password reset.
- Daily summary.
- Deadline reminders.
- Admin error alerts.

Email requires Resend environment configuration.

## 20. API Logging Flow

```text
Incoming request
  -> RequestIdMiddleware attaches request id
  -> ApiFlowInterceptor records HTTP/controller flow
  -> Public service instrumentation records app service flow
  -> PrismaService records query flow
  -> Exception filter captures failures
  -> ApiLoggerService writes console summary
  -> ApiLoggerService writes ApiRequestLog row
  -> ApiLoggerService appends daily JSONL file
  -> ErrorAlertService optionally emails admin
```

Daily log file format:

```text
server/logs/YYYY-MM-DD_api-flow.log
```

The log file is JSONL, one request per line.

## 21. Error Flow

```text
Exception thrown
  -> Global exception filter normalizes status and response
  -> Request and response are sanitized
  -> API request log is persisted
  -> Daily JSONL log receives the failed flow
  -> Admin email is sent when configured and status threshold matches
  -> Client receives structured error message
```

The frontend generally turns backend errors into visible notices, loading states, or inline error text.

## 22. Data Ownership Rules

- Every workspace-scoped query must verify membership.
- Most deletes are soft deletes.
- Files remain linked through metadata even when the UI hides R2 implementation details.
- Auth sessions are explicitly revocable.
- Audit logs capture important business mutations.
- AI messages are persisted for user assistant history.

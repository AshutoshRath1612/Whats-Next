# What's Next? Feature TODO

This file tracks the work needed to turn What's Next? from a polished static shell into a complete daily productivity product.

## 0. Authentication / Session

- [x] Login page.
- [x] Register page.
- [x] Forgot password route placeholder.
- [x] Reset password route placeholder.
- [x] Email/password login calls backend `/auth/login`.
- [x] Email/password registration calls backend `/auth/register`.
- [x] JWT is issued by the backend and validated through the server session on reload.
- [x] Existing JWT is validated with `/users/me` on app load.
- [x] Protected workspace route redirects unauthenticated users to `/login`.
- [x] Authenticated users are redirected away from login/register.
- [x] Logout clears session and returns to login.
- [x] Workspace data is not persisted in browser storage.
- [x] Unauthenticated preview option removed so all users must sign in.
- [x] Google login.
- [x] Real forgot-password email flow.
- [x] Real reset-password token flow.
- [x] Refresh-token flow or explicit re-login on expiry.
- [x] Store token in a more secure cookie-based session.
- [x] Backend logout clears the server-issued auth cookie.
- [x] Persisted session/token revocation for bearer token invalidation.

## 1. Product Shell

- [x] Collapsible sidebar.
- [x] Theme switching.
- [x] Top navigation.
- [x] Command palette.
- [x] Sidebar navigation changes active module.
- [x] Removed separate Inbox screen to avoid confusing overlap with Tasks.
- [x] Global create button opens contextual creation flow.
- [x] Mobile-safe layout foundation.
- [x] Mobile navigation drawer opens and navigates.
- [x] Command palette uses live workspace data instead of static sample results.
- [x] Authenticated app shell loads the user's workspaces from the backend.
- [x] Workspace breadcrumb and sidebar identity use the active workspace instead of hardcoded sample text.
- [x] Workspace switcher appears when the user has multiple workspaces.
- [x] Persist selected workspace and active module in URL routes.
- [x] Add full route-per-module support.

## 2. Dashboard

- [x] Dynamic metrics derived from workspace state.
- [x] Today's task list updates when tasks change.
- [x] Pinned projects and notes reflect workspace data.
- [x] Running timer panel supports start, pause, resume, stop.
- [x] AI suggestions create draft output.
- [x] Load dashboard analytics from backend.
- [x] Add configurable dashboard widgets.
- [x] Fix dashboard summarize action feedback and AI result visibility.
- [x] Align dashboard hero action buttons to the right side of the card.
- [x] Clicking dashboard metric cards navigates to the relevant module.
- [x] Clicking dashboard task cards opens the specific task detail.
- [x] Dashboard task descriptions are readable instead of clipped mid-content.
- [x] Reduce weekly activity card height and unused whitespace.
- [x] Stack What To Work On, Weekly Activity, and Kanban Snapshot vertically for clearer scanning.
- [x] Add clearer labels/categories to the dashboard project section.
- [x] Make recent notes dashboard items navigate to their specific detail.
- [x] Add a recent files dashboard widget and navigate file items to their specific detail/preview.

## 3. Global Search / Command Palette

- [x] Search across tasks, projects, notes, tickets, SQL, knowledge articles, templates, and calendar.
- [x] Selecting a result jumps to the relevant module.
- [x] Keyboard shortcut `Ctrl+K` opens search.
- [x] Newly created local items appear in search results.
- [x] Add command actions such as create task, start timer, copy template.
- [x] Debounce backend global search.
- [x] Add keyboard navigation inside command palette results.
- [x] Add command actions for create note, AI search, switch workspace, and toggle theme.

## 4. Tasks

- [x] Authenticated task list loads from backend `/tasks` for the active workspace.
- [x] Task creation persists to backend for authenticated users.
- [x] Task status changes from dashboard, task details, and kanban persist to backend with optimistic rollback.
- [x] Task APIs are scoped to authenticated workspace membership.
- [x] Task list view.
- [x] Kanban-style grouping by status.
- [x] Details mode and Kanban mode switcher.
- [x] Create task.
- [x] Create task form includes project, start date, due date, estimate, tags, checklist, subtasks, dependencies, and acceptance criteria.
- [x] Task start date and due date use real date inputs.
- [x] Removed user-facing owner field from task creation because the logged-in user owns created tasks by default.
- [x] Create task dialog is height-constrained with a scrollable body.
- [x] Complete/reopen task.
- [x] Reopening a completed task resets standalone progress from 100%.
- [x] Change task status.
- [x] Add Pending status for tasks waiting on another person/system.
- [x] Priority and due-date display.
- [x] Past-due open tasks have consistent overdue styling across task surfaces.
- [x] Kanban board is horizontally scrollable.
- [x] Kanban columns use fixed readable widths instead of squeezing into the viewport.
- [x] Kanban cards show only title, due date, and priority.
- [x] Kanban cards can be dragged into another status column.
- [x] Task detail drawer opens from detail rows and kanban cards.
- [x] Task detail drawer includes related project, dates, estimate, progress, checklist, subtasks, dependencies, attachments, tracked time, and acceptance criteria.
- [x] Task detail editable fields have explicit labels.
- [x] Task-specific notes timeline for progress, blockers, decisions, and context.
- [x] Add task progress notes from the task drawer.
- [x] Persist task drawer field edits beyond status.
- [x] Persist task progress notes to backend.
- [x] Persist checklist updates to backend.
- [x] Edit title, description, tags, subtasks, dependencies, and attachments from the task drawer.
- [x] Calendar and timeline task views.
- [x] Recurring task engine.
- [x] Daily, weekly, and monthly recurrence options on task create/edit.
- [x] Completing a recurring task creates the next Todo occurrence with shifted start/due dates.

## 5. Projects

- [x] Project cards with progress.
- [x] Create project.
- [x] Project task counts derived from tasks.
- [x] Project detail page with tasks, notes, files, milestones, activity.
- [x] Project cover image and custom icon picker.
- [x] Fix project cover images that fail to render.
- [x] Edit project.
- [x] Pin/unpin project.
- [x] Archive/delete project with confirmation.

## 6. Notes

- [x] Notes library.
- [x] Create note.
- [x] Pinned notes.
- [x] Markdown-style content preview.
- [x] Rich text editor.
- [x] Backlinks graph.
- [x] Version history.

## 7. Knowledge Base

- [x] Knowledge articles list.
- [x] Problem / root cause / resolution cards.
- [x] Promote solved ticket to article.
- [x] Related tasks, tickets, SQL, notes, and files.
- [x] Grounded workspace AI search with source-backed answers and insufficient-information fallback.
- [x] Grounded workspace AI search maps natural language aliases, common typos, plural/singular terms, source-type intent, and date intent to backend workspace records.

## 8. Tickets

- [x] Ticket list with priority, severity, status, customer.
- [x] Create ticket.
- [x] Status grouping.
- [x] Consolidate tickets into tasks as a task subtype for office/customer work.
- [x] Add task fields for ticket number, customer, severity, investigation, resolution, and closure notes.
- [x] Replace standalone ticket workflow with task detail workflow plus ticket-specific fields.
- [x] Ticket-to-knowledge article conversion from task subtype.

## 9. SQL Library

- [x] SQL snippet library.
- [x] Copy SQL.
- [x] Favorite indicators.
- [x] Syntax-highlighted code editor.
- [x] Snippet history and folders.
- [x] Execution notes detail view.
- [x] Tag filtering and search inside SQL Library.

## 10. Calendar

- [x] Agenda view.
- [x] Calendar events represented in workspace state.
- [x] Day/week/month layouts.
- [x] Reminder scheduling and browser notifications.
- [x] Calendar event edit/delete.
- [x] Link calendar events to tasks/projects.
- [x] Show task deadlines in calendar.

## 11. Time Tracking

- [x] Start timer.
- [x] Pause timer.
- [x] Resume timer.
- [x] Stop timer and write duration into daily summary.
- [x] Running timers tick live in the UI.
- [x] Pausing and stopping preserves elapsed time.
- [x] Focus metrics include the current running timer.
- [x] Manual time entry.
- [x] Weekly reports.
- [x] Link timer to a task when starting from dashboard or app shell.
- [x] Add time by task and time by project reports.

## 12. Templates

- [x] Template library.
- [x] Copy template body.
- [x] Variable fill-in UI.
- [x] Categories and favorites.

## 13. AI Assistant

- [x] Assistant panel with prompt input.
- [x] Draft response generation placeholder.
- [x] Connect provider-backed AI API.
- [x] Summarize notes, tickets, SQL, daily and weekly activity.
- [x] Improve AI response UI beyond plain preformatted text.
- [x] Add AI loading and failure states across all AI entry points.
- [x] Add workflow actions for note summary, ticket summary, SQL explanation, RCA, and email drafting.
- [x] Add retrieval-backed AI ask endpoint that searches workspace data before answering.
- [x] Make retrieval-backed AI ask understand natural phrasing beyond exact keywords while preserving grounded no-answer behavior.

## 14. Authentication / Backend Integration

- [x] Backend auth endpoints exist.
- [x] Backend workspace/task/project/note/ticket/search/analytics endpoints exist.
- [x] Registration workspace slugs avoid collisions.
- [x] Seed command does not create sample users, workspaces, or content.
- [x] Frontend login/register screens.
- [x] Authenticated API client.
- [x] Notes load, create, and update through backend APIs for authenticated users.
- [x] Projects load and create through backend APIs for authenticated users.
- [x] SQL snippets load, create, and update through backend APIs for authenticated users.
- [x] Calendar events load, create, and update reminders through backend APIs for authenticated users.
- [x] Time entries load, start, pause/resume, stop, and manual entries persist through backend APIs for authenticated users.
- [x] Replace remaining browser-local sample store modules with backend persistence.
- [x] Google login.
- [x] Onboarding flow for first workspace setup and preferences.
- [x] Workspace edit name/icon/color.
- [x] Workspace archive/delete with confirmation.
- [x] Backend pagination, filtering, and sorting standards across list APIs.
- [x] Audit logging hooks on important mutations.
- [x] Analytics timeframe, status, and priority filters.
- [x] Analytics due, overdue, pending, in-progress, average-progress, project-progress, and time-by-task breakdowns.

## 15. Files / Import / Export / Settings

- [x] Files and settings have navigable placeholder modules.
- [x] File upload and linking.
- [x] Import/export and restore flows.
- [x] Security, notification, AI, backup, and keyboard shortcut settings.
- [x] Cloudflare R2 storage for photos, file uploads, and backups.
- [x] File preview/download/delete.
- [x] Backend file metadata persistence and search.
- [x] Functional profile settings for name, avatar, and timezone.
- [x] Functional workspace settings for default views.
- [x] Change password, active sessions, and logout-all-devices settings.
- [x] Email reminders, daily summary notifications, upcoming deadline alerts, and timer-still-running notifications.

## 16. Accessibility / Quality

- [x] Dialog focus trapping and Escape-to-close behavior.
- [x] ARIA labels for icon-only buttons.
- [x] Keyboard-complete critical workflows.
- [x] Frontend tests for auth, navigation, task creation, task detail updates, kanban drag/drop, task notes, and theme switch.
- [x] Backend tests for auth, workspace guards, CRUD APIs, search, and seed idempotency.
- [x] E2E tests for register, create task, move kanban task, add task note, logout/login, and persistence.

## 17. Audit Reopened Items

- [x] Global command search includes backend results for files, templates, and calendar events.
- [x] Local command palette includes loaded workspace files.
- [x] Add first-class workspace creation in the authenticated app shell/settings flow.
- [x] Scope time entries and time reports by workspace, including manual entries that are not linked to a task.
- [x] Persist note version history on the backend instead of keeping versions only in the local client state.
- [x] Add automated scheduled delivery for daily summaries, deadline reminders, and reminder emails instead of manual send actions only.
- [x] Implement Cloudflare R2-backed backup storage for Settings JSON exports and backend restore.
- [x] Re-check Prisma migration status against the local PostgreSQL database and document/apply any required migration repair.
- [x] Reconcile stale `docs/bugs.txt` entries with implemented fixes and convert any still-relevant items into tracked TODOs.

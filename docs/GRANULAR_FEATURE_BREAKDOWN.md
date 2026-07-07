# What's Next? Granular Feature Breakdown

This document breaks What's Next? into implementation-ready feature areas, from a user first opening the website through daily work and logout. It follows the original requirement: a premium all-in-one productivity workspace combining task management, project management, notes, documentation, tickets, SQL snippets, files, calendar, time tracking, analytics, AI assistance, and personal organization.

The goal is to avoid vague modules and instead define what each area must actually do before it can be considered complete.

## 0. Product Principles

### 0.1 Core Product Promise

- What's Next? should be the user's daily command center.
- The app should answer: "What should I work on right now?"
- The app should reduce switching between todo apps, notes, docs, ticket notes, SQL snippets, calendars, timers, and personal knowledge tools.

### 0.2 UX Principles

- Every major action must be understandable without explanation text.
- Navigation must be obvious and not duplicate concepts unnecessarily.
- Data shown on dashboards must come from real workspace state or APIs.
- Empty states must guide the next action.
- Every create/edit/delete operation must give feedback.
- Every list/card item must open a detail view when clicked.
- Important workflows must work with keyboard and mouse.
- Dark/light theme must be consistent.
- Mobile layouts must remain usable, not merely shrink desktop UI.

## 1. First Visit / Public Experience

### 1.1 Landing / Entry Decision

- Show product identity clearly: What's Next?
- Explain the workspace value briefly.
- Provide primary actions:
  - Sign in
  - Create account
- Do not provide unauthenticated preview access; workspace data requires authentication.
- If user already has a valid session, redirect to dashboard.

### 1.2 Public Routes

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- Optional `/privacy`
- Optional `/terms`

### 1.3 Acceptance Criteria

- A new visitor understands what the app is.
- A returning user can immediately sign in.
- An authenticated user should not see auth pages unless logging out.

## 2. Authentication

### 2.1 Email Registration

- Fields:
  - Name
  - Email
  - Password
  - Confirm password
- Validation:
  - Valid email
  - Password minimum length
  - Password strength guidance
  - Confirm password must match
- On success:
  - Create user
  - Create default workspace
  - Create owner membership
  - Start authenticated session
  - Redirect to onboarding or dashboard

### 2.2 Email Login

- Fields:
  - Email
  - Password
- Behavior:
  - Show validation errors inline.
  - Show safe invalid credentials message.
  - Store JWT/session securely.
  - Redirect to dashboard.

### 2.3 Google Login

- OAuth button.
- Create user if first login.
- Link Google identity to existing email if safe.
- Create default workspace on first login.

### 2.4 JWT / Session Handling

- Store access token securely.
- Attach token to API requests.
- Refresh or re-login flow when expired.
- Clear session on logout.
- Prevent protected pages without auth.

### 2.5 Logout

- Logout button in user/account menu.
- Clear token/session.
- Clear sensitive local state.
- Redirect to login.

### 2.6 Security

- Password hashing on backend.
- Rate limit auth endpoints.
- Do not leak whether email exists in sensitive flows.
- Validate all auth DTOs.
- Protect all workspace APIs with guards.

### 2.7 Acceptance Criteria

- A user can register, login, refresh, use app, and logout.
- Protected pages cannot be accessed without auth.
- API calls fail safely when token is missing or expired.

## 3. Onboarding

### 3.1 First Workspace Setup

- Ask user to name workspace.
- Choose workspace category:
  - Work
  - Personal
  - Learning
  - Fitness
  - Gaming
  - Travel
  - Finance
  - Custom
- Choose icon and color.

### 3.2 Preference Setup

- Theme preference.
- Timezone.
- Daily summary time.
- Default task view:
  - Details
  - Kanban
  - Calendar
- No generated or offline sample workspace data.

### 3.3 Acceptance Criteria

- New users are not dropped into an unexplained dashboard.
- Default workspace is usable immediately.

## 4. App Shell / Navigation

### 4.1 Layout

- Top navigation.
- Collapsible left sidebar.
- Main content area.
- Optional right context panel.
- Mobile drawer navigation.

### 4.2 Sidebar Items

- Dashboard
- Tasks
- Projects
- Tickets
- Knowledge Base
- Notes
- SQL Library
- Calendar
- Time Tracker
- Files
- Templates
- Analytics
- Personal
- Gaming
- Settings

Inbox is intentionally excluded for now because it overlaps with Tasks and causes confusion.

### 4.3 Top Bar

- Current workspace switcher.
- Breadcrumb / current module title.
- Global search button.
- Create button.
- Notifications.
- Theme toggle.
- User/account menu.

### 4.4 Global Create

- Context-aware create action.
- On Dashboard: quick create menu.
- On Tasks: create task.
- On Notes: create note.
- On Tickets: create ticket.
- On SQL Library: create SQL snippet.

### 4.5 Acceptance Criteria

- User always knows where they are.
- Sidebar links work.
- Mobile navigation works.
- Create button performs an understandable action.

## 5. Dashboard

### 5.1 Dashboard Purpose

The dashboard should answer:

- What should I work on right now?
- What is due soon?
- What is blocked?
- What is already in progress?
- How much focus time have I logged?
- What changed recently?

### 5.2 Widgets

- Today's priority tasks.
- Upcoming deadlines.
- Calendar agenda.
- Running timer.
- Recent notes.
- Pinned projects.
- Pinned notes.
- AI suggestions.
- Weekly progress.
- Recent activity.
- Quick actions.
- Productivity chart.

### 5.3 Widget Behavior

- Widgets must use real user/workspace data.
- Empty widgets must show a useful empty state.
- Clicking a task opens task detail.
- Clicking a project opens project detail.
- Clicking a note opens note editor/viewer.
- Clicking a calendar item opens event detail.

### 5.4 Dashboard Quick Actions

- New task.
- New note.
- Start timer.
- Create ticket.
- Add calendar event.
- Ask AI.

### 5.5 Acceptance Criteria

- Dashboard is not a static marketing page.
- User can act from the dashboard.
- Dashboard changes when underlying data changes.
- Layout is clean and not cluttered.

## 6. Global Search / Command Palette

### 6.1 Trigger

- `Ctrl+K` / `Cmd+K`.
- Search button in top bar.

### 6.2 Search Sources

- Tasks.
- Projects.
- Notes.
- Tickets.
- Knowledge articles.
- SQL snippets.
- Files.
- Templates.
- Calendar events.
- Settings.

### 6.3 Result Behavior

- Show type, title, and useful metadata.
- Selecting result navigates to the item detail.
- Support keyboard navigation.
- Show empty state.
- Debounced backend search.

### 6.4 Command Actions

- Create task.
- Create note.
- Start timer.
- Copy template.
- Search with AI.
- Switch workspace.
- Toggle theme.

### 6.5 Acceptance Criteria

- Search works across all major entities.
- Newly created data appears in search.
- Keyboard-only usage is possible.

## 7. Workspace System

### 7.1 Workspace Model

- Name.
- Slug.
- Icon.
- Color.
- Owner.
- Members, future.
- Settings.

### 7.2 Workspace Actions

- Create workspace.
- Switch workspace.
- Edit workspace name/icon/color.
- Archive workspace.
- Delete workspace, with confirmation.

### 7.3 Workspace Data Scope

Each workspace owns:

- Projects.
- Tasks.
- Notes.
- Tickets.
- Knowledge articles.
- SQL snippets.
- Files.
- Calendar events.
- Timers.
- Templates.
- Settings.

### 7.4 Acceptance Criteria

- Data from one workspace does not leak into another.
- Workspace switch updates all modules.

## 8. Tasks

### 8.1 Task Purpose

Tasks are the central execution unit. They should support planning, tracking, notes, progress, and status movement.

### 8.2 Task Fields

- Title.
- Description.
- Project.
- Status.
- Priority.
- Start date.
- Due date.
- Tags.
- Labels.
- Checklist.
- Subtasks.
- Dependencies.
- Attachments.
- Estimate.
- Actual time.
- Progress percent.
- Acceptance criteria.
- Task notes.
- Activity history.
- Recurrence, future.
- Custom fields, future.

The visible owner/assignee field is not required until multi-user assignment exists. The creating user can be stored internally.

### 8.3 Task Creation

- Modal/drawer must fit viewport.
- Fields:
  - Title, required.
  - Description.
  - Project.
  - Priority.
  - Start date, real date input.
  - Due date, real date input.
  - Estimate.
  - Tags.
  - Checklist items.
  - Subtasks.
  - Dependencies.
  - Acceptance criteria.
- Validation:
  - Title required.
  - Due date cannot be before start date.
  - Estimate must be numeric.

### 8.4 Task Views

- Details mode:
  - Dense list of tasks.
  - Shows title, status, priority, project, dates, progress, checklist count.
  - Clicking row opens detail drawer.
- Kanban mode:
  - Horizontal scroll.
  - Fixed-width columns.
  - Columns by status.
  - Cards show title, due date, priority only.
  - Drag card to status column to update status.
- Calendar mode, future.
- Timeline mode, future.

### 8.5 Task Detail Drawer

- Header:
  - Title.
  - Status.
  - Priority.
  - Project.
- Editable fields with labels:
  - Status.
  - Priority.
  - Start date.
  - Due date.
  - Progress percent.
  - Actual time.
- Readable sections:
  - Description.
  - Checklist.
  - Subtasks.
  - Dependencies.
  - Attachments.
  - Tracked time.
  - Acceptance criteria.
  - Notes timeline.
  - Activity history.

### 8.6 Task Notes

- Add progress notes.
- Add blocker notes.
- Add decision notes.
- Add investigation notes.
- Each note has timestamp.
- Notes should be visible in task detail.
- Future:
  - Mention/link notes.
  - Convert note to knowledge article.

### 8.7 Task Statuses

- Backlog.
- Todo.
- In Progress.
- Pending.(when work is  dependent on others)
- Review.
- Done.

### 8.8 Acceptance Criteria

- User can create a rich task.
- User can switch task views.
- User can drag task status in kanban.
- User can open task details from any task card/row.
- User can add task progress notes.
- Task updates persist.

## 9. Projects

### 9.1 Project Fields

- Name.
- Description.
- Icon.
- Color.
- Cover image.
- Status.
- Start date.
- Due date.
- Progress.
- Milestones.
- Pinned flag.

### 9.2 Project Detail

- Overview.
- Related tasks.
- Related notes.
- Related tickets.
- Files.
- Timeline.
- Milestones.
- Activity.

### 9.3 Project Actions

- Create project.
- Edit project.
- Pin/unpin project.
- Archive project.
- Delete project with confirmation.

### 9.4 Acceptance Criteria

- Project page is not just cards.
- Clicking project opens full project workspace.
- Progress derives from tasks or can be manually set.

## 10. Notes

### 10.1 Note Fields

- Title.
- Content.
- Format:
  - Markdown.
  - Rich text, future.
- Tags.
- Pinned.
- Project link.
- Task embeds.
- Backlinks.
- Version history.

### 10.2 Editor Features

- Markdown editor.
- Preview mode.
- Code blocks.
- Tables.
- Callouts.
- Images.
- Math, future.
- Autosave.

### 10.3 Notes Views

- List.
- Cards.
- Pinned notes.
- Tag filtering.
- Search.

### 10.4 Acceptance Criteria

- User can create, edit, and view notes.
- Notes persist.
- Notes can link to tasks/projects.

## 11. Knowledge Base

### 11.1 Article Fields

- Title.
- Problem.
- Root cause.
- Resolution.
- Related tasks.
- Related tickets.
- Related SQL.
- Related notes.
- References.
- Attachments.
- Tags.

### 11.2 Article Actions

- Create article.
- Edit article.
- Promote solved ticket to article.
- Convert task details to article for future reference
- Link task/ticket/SQL/note.
- Search/filter articles.

### 11.3 Acceptance Criteria

- Knowledge Base is structured, not just notes.
- Solved work can become reusable documentation.

## 12. Tickets

A ticket is a type of task as well. for any office related work we work on tickets and per personal works as there is no ticket we can consider task. so ticket is a subgroup of task and can be replced with task instead.

### 12.1 Ticket Fields

- Ticket number.
- Customer.
- Title.
- Priority.
- Severity.
- Status.
- Investigation.
- Resolution.
- Closure notes.
- Comments.
- Related SQL.
- Related files.
- History.

### 12.2 Ticket Workflow

- Open.
- Investigating.
- Waiting.
- Resolved.
- Closed.

### 12.3 Ticket Detail

- Header.
- Customer context.
- Investigation notes.
- Resolution notes.
- Related tasks.
- Related SQL.
- Files.
- Comments.
- History.

### 12.4 Acceptance Criteria

- Ticket detail supports real investigation workflow.
- Ticket can link to docs and SQL.

## 13. SQL Library

### 13.1 SQL Snippet Fields

- Title.
- Description.
- Query.
- Database tags.
- Folder.
- Favorite.
- History.
- Execution notes.

### 13.2 SQL Features

- Syntax highlighting.
- Copy button.
- Favorite/unfavorite.
- Folder filtering.
- Tag filtering.
- Search.
- Edit snippet.

### 13.3 Acceptance Criteria

- SQL Library is useful as a snippet manager.
- Copy is reliable and gives feedback.

## 14. Files

### 14.1 Supported File Types

- PDF.
- Excel.
- Word.
- ZIP.
- Images.
- Videos.
- Logs.

### 14.2 File Features

- Upload file.
- Preview supported types.
- Download.
- Delete.
- Link file to task/project/ticket/note/article.
- Search files.

### 14.3 Acceptance Criteria

- Files are not just a placeholder page.
- Files can be linked to entities.

## 15. Calendar

### 15.1 Calendar Views

- Day.
- Week.
- Month.
- Agenda.

### 15.2 Event Fields

- Title.
- Description.
- Start date/time.
- End date/time.
- Type.
- Reminder.
- Related task/project.

### 15.3 Calendar Actions

- Create event.
- Edit event.
- Delete event.
- Link task due dates.
- Show task deadlines.

### 15.4 Acceptance Criteria

- Calendar supports real planning.
- Task dates are visible in calendar.

## 16. Time Tracking

### 16.1 Timer Features

- Start timer.
- Pause.
- Resume.
- Stop.
- Link timer to task.
- Manual entry.

### 16.2 Reports

- Daily summary.
- Weekly summary.
- Time by task.
- Time by project.

### 16.3 Acceptance Criteria

- Time is actually accumulated.
- Stopped timers preserve duration.
- Time can be reviewed later.

## 17. Templates

### 17.1 Template Fields

- Name.
- Category.
- Body.
- Variables.
- Favorite.

### 17.2 Template Features

- Create template.
- Edit template.
- Copy template.
- Fill variables.
- Categorize.
- Search.

### 17.3 Acceptance Criteria

- User can reuse professional emails and status updates.

## 18. AI Assistant

### 18.1 AI Entry Points

- Dashboard assistant.
- Command palette action.
- Note summarization.
- Ticket summarization.
- SQL explanation.
- RCA generation.
- Email drafting.
- Daily summary.
- Weekly summary.

### 18.2 AI Capabilities

- Summarize notes.
- Draft professional emails.
- Generate meeting notes.
- Generate RCA.
- Explain SQL.
- Summarize tickets.
- Generate documentation.
- Prioritize tasks.
- Suggest related articles.
- Natural language search.

### 18.3 AI Safety / UX

- Show generated draft before applying.
- Do not overwrite user content without confirmation.
- Show loading state.
- Show failure state.

### 18.4 Acceptance Criteria

- AI is integrated into real workflows, not just a placeholder box.

## 19. Notifications

### 19.1 Notification Types

- Browser notification.
- Email reminder.
- Daily summary.
- Upcoming deadline.
- Timer still running.

### 19.2 Notification Settings

- Enable/disable browser notifications.
- Enable/disable email reminders.
- Configure daily summary time.
- Configure deadline reminder offsets.

### 19.3 Acceptance Criteria

- User can control notifications.
- Notifications are tied to real due dates/events.

## 20. Analytics

### 20.1 Metrics

- Completed tasks.
- Open tasks.
- Time spent.
- Projects progress.
- Ticket count.
- Productivity trends.
- Weekly progress.
- Monthly reports.

### 20.2 Visualizations

- Bar charts.
- Line/area charts.
- Progress cards.
- Time breakdown.

### 20.3 Acceptance Criteria

- Analytics uses real workspace data.
- Charts update when data changes.

## 21. Settings

### 21.1 Profile

- Name.
- Email.
- Avatar.
- Timezone.

### 21.2 Theme

- Light.
- Dark.
- System.

### 21.3 Workspace Settings

- Workspace name.
- Icon.
- Color.
- Default views.

### 21.4 Notifications

- Browser notifications.
- Email reminders.
- Summary schedule.

### 21.5 AI Settings

- Provider configuration.
- Enable/disable AI.
- Default assistant behavior.

### 21.6 Security

- Change password.
- Active sessions.
- Logout all devices.

### 21.7 Backup / Import / Export

- Export workspace.
- Import data.
- Backup settings.
- List previous backups.
- Restore workspace from a selected backup.
- Automatic backup cadence: every 12 hours, every 24 hours, or off.

### 21.8 Keyboard Shortcuts

- View shortcuts.
- Customize later.

### 21.9 Acceptance Criteria

- Settings are functional, not placeholder text.

## 22. Backend API Completeness

### 22.1 Required API Areas

- Auth.
- Users.
- Workspaces.
- Projects.
- Tasks.
- Task notes.
- Notes.
- Tickets.
- Knowledge articles.
- SQL snippets.
- Files.
- Calendar events.
- Time entries.
- Templates.
- Search.
- AI.
- Analytics.
- Notifications.
- Settings.
- Audit logs.

### 22.2 API Requirements

- JWT guards.
- Validation DTOs.
- Pagination.
- Filtering.
- Sorting.
- Searching.
- Soft deletes.
- Audit logging.
- Consistent error responses.

### 22.3 Acceptance Criteria

- Frontend is not dependent on browser-local sample state for core workflows.
- API behavior is testable and predictable.

## 23. Data Persistence

### 23.1 Current Temporary State

- Local browser state is useful for prototyping only.
- It must be replaced with authenticated backend persistence.

### 23.2 Required Persistence

- User-specific data.
- Workspace-scoped data.
- Entity relationships.
- Task notes.
- Activity history.
- Files.
- Settings.

### 23.3 Acceptance Criteria

- User can login on another browser and see workspace data.
- Refreshing page does not lose data.
- Logout prevents access to private data.

## 24. Accessibility

### 24.1 Requirements

- Keyboard navigation.
- Focus states.
- ARIA labels for icon buttons.
- Dialog focus trapping.
- Escape closes dialogs.
- Screen-reader labels for forms.
- Sufficient contrast.

### 24.2 Acceptance Criteria

- Major workflows can be completed with keyboard.
- Form controls have labels.

## 25. Testing / Quality

### 25.1 Frontend Tests

- Auth flow.
- Navigation.
- Task creation.
- Task detail updates.
- Kanban drag/drop.
- Task notes.
- Theme switch.

### 25.2 Backend Tests

- Auth.
- Workspace access guards.
- CRUD APIs.
- Search.
- Seed idempotency.

### 25.3 E2E Tests

- Register user.
- Create task.
- Move task in kanban.
- Add task note.
- Logout/login.
- Confirm data persists.

### 25.4 Acceptance Criteria

- Builds pass.
- Critical workflows have tests.
- No obvious placeholder modules remain in production surfaces.

## 26. Implementation Priority

### Phase 1: Make App Usable End-to-End

1. Auth pages and session handling.
2. Protected app shell.
3. Backend-connected workspace loading.
4. Backend-connected tasks.
5. Task create/detail/notes/kanban persistence.
6. Logout.

### Phase 2: Daily Workflows

1. Dashboard from backend data.
2. Projects with detail page.
3. Notes editor.
4. Calendar agenda and task deadlines.
5. Time tracking linked to tasks.

### Phase 3: Support / Knowledge Work

1. Tickets detail workflow.
2. Knowledge Base article editing.
3. SQL Library editor and copy.
4. File attachments.

### Phase 4: Intelligence / Automation

1. AI provider integration.
2. Summaries.
3. Suggestions.
4. Notifications.
5. Analytics reports.

### Phase 5: Production Polish

1. Tests.
2. Accessibility.
3. Error boundaries.
4. Loading states.
5. Empty states.
6. Import/export.
7. Deployment hardening.

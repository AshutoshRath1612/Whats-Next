export type EmailMessage = {
  subject: string;
  text: string;
  html: string;
};

type DailySummaryTask = {
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
};

type DailySummaryTimer = {
  title: string;
  durationMin: number;
  durationSec?: number;
  status: string;
};

type AiSummary = {
  content: string;
  providerLabel?: string;
  model?: string;
};

type ReminderNotification = {
  title: string;
  body: string;
  tone?: "default" | "warning" | "success";
};

type AdminErrorInput = {
  requestId: string;
  statusCode?: number;
  method: string;
  path: string;
  route?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  errorName?: string | null;
  errorMessage?: string | null;
  query?: unknown;
  params?: unknown;
  body?: unknown;
  stack?: string;
};

const brand = {
  name: "What's Next?",
  tagline: "Plan. Focus. Achieve.",
  primary: "#4F46E5",
  ink: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
  background: "#F8FAFC",
  card: "#FFFFFF",
  success: "#059669",
  warning: "#D97706",
  error: "#DC2626"
};

export function buildPasswordResetEmail(input: { resetUrl: string; expiresIn?: string }): EmailMessage {
  const expiresIn = input.expiresIn ?? "soon";
  const subject = "Reset your What's Next? password";
  const text = [
    "Reset your What's Next? password",
    "",
    `Use this link to choose a new password. The link expires ${expiresIn}.`,
    input.resetUrl,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n");

  return {
    subject,
    text,
    html: renderLayout({
      title: "Reset your password",
      preheader: `Use this secure link to reset your What's Next? password.`,
      intro: `Use the button below to choose a new password. This link expires ${escapeHtml(expiresIn)}.`,
      badge: "Security",
      body: [
        renderActionButton("Reset password", input.resetUrl),
        renderInfoBox("Did not request this?", "You can safely ignore this email. Your password will stay unchanged.")
      ].join("")
    })
  };
}

export function buildDailySummaryEmail(input: { workspaceName: string; userName?: string; tasks: DailySummaryTask[]; timers: DailySummaryTimer[]; aiSummary?: AiSummary; now?: Date }): EmailMessage {
  const now = input.now ?? new Date();
  const todayKey = toDateKey(now);
  const openTasks = input.tasks.filter((task) => !["DONE", "CANCELED"].includes(task.status));
  const dueOrOverdue = openTasks.filter((task) => task.dueDate && toDateKey(task.dueDate) <= todayKey);
  const highPriority = openTasks.filter((task) => ["HIGH", "URGENT"].includes(task.priority));
  const completed = input.tasks.filter((task) => task.status === "DONE");
  const priorityTasks = uniqueTasks([...dueOrOverdue, ...highPriority, ...openTasks]).slice(0, 6);
  const trackedSeconds = input.timers.reduce((sum, timer) => sum + (timer.durationSec ?? timer.durationMin * 60), 0);
  const subject = `What's Next? daily summary - ${input.workspaceName}`;
  const greeting = input.userName ? `Hi ${input.userName}, here is your workspace summary.` : "Here is your workspace summary.";

  const text = [
    `Daily summary for ${input.workspaceName}`,
    "",
    greeting,
    "",
    ...(input.aiSummary ? [
      `AI daily briefing${input.aiSummary.providerLabel ? ` (${input.aiSummary.providerLabel}${input.aiSummary.model ? ` / ${input.aiSummary.model}` : ""})` : ""}:`,
      input.aiSummary.content,
      ""
    ] : []),
    "Workspace facts used:",
    `Open work: ${openTasks.length}`,
    `Due or overdue: ${dueOrOverdue.length}`,
    `High priority: ${highPriority.length}`,
    `Tracked today: ${formatDuration(trackedSeconds)}`,
    "",
    "Priority focus:",
    ...(priorityTasks.length ? priorityTasks.map(formatTaskLine) : ["- No overdue, due-today, or high-priority tasks found."]),
    "",
    "Completed recently:",
    ...(completed.slice(0, 5).length ? completed.slice(0, 5).map(formatTaskLine) : ["- No completed tasks in the latest task window."]),
    "",
    "Recent time entries:",
    ...(input.timers.slice(0, 5).length ? input.timers.slice(0, 5).map((timer) => `- ${timer.title}: ${formatDuration(timer.durationSec ?? timer.durationMin * 60)} (${formatStatus(timer.status)})`) : ["- No tracked time today."])
  ].join("\n");

  return {
    subject,
    text,
    html: renderLayout({
      title: "Daily workspace summary",
      preheader: `${openTasks.length} open, ${dueOrOverdue.length} due or overdue, ${formatDuration(trackedSeconds)} tracked today.`,
      intro: escapeHtml(greeting),
      badge: escapeHtml(input.workspaceName),
      body: [
        input.aiSummary ? renderSection("AI daily briefing", renderAiSummary(input.aiSummary)) : "",
        renderMetrics([
          { label: "Open work", value: String(openTasks.length), tone: "neutral" },
          { label: "Due or overdue", value: String(dueOrOverdue.length), tone: dueOrOverdue.length ? "warning" : "success" },
          { label: "High priority", value: String(highPriority.length), tone: highPriority.length ? "warning" : "neutral" },
          { label: "Tracked today", value: formatDuration(trackedSeconds), tone: trackedSeconds ? "success" : "neutral" }
        ]),
        renderSection("Priority focus", priorityTasks.length ? priorityTasks.map(renderTaskCard).join("") : renderEmpty("Nothing urgent is waiting in the latest task window.")),
        renderSection("Completed recently", completed.length ? completed.slice(0, 5).map(renderTaskCard).join("") : renderEmpty("No completed tasks in the latest task window.")),
        renderSection("Recent time entries", input.timers.length ? input.timers.slice(0, 5).map(renderTimerCard).join("") : renderEmpty("No tracked time has been recorded today."))
      ].join("")
    })
  };
}

export function buildReminderDigestEmail(input: { workspaceName: string; notifications: ReminderNotification[] }): EmailMessage {
  const warningCount = input.notifications.filter((notification) => notification.tone === "warning" || /overdue|due|timer/i.test(notification.title)).length;
  const subject = `What's Next? reminders - ${input.workspaceName}`;
  const text = [
    `Reminder digest for ${input.workspaceName}`,
    "",
    ...(input.notifications.length ? input.notifications.map((notification) => `- ${notification.title}: ${notification.body}`) : ["- No urgent reminders right now."])
  ].join("\n");

  return {
    subject,
    text,
    html: renderLayout({
      title: "Reminder digest",
      preheader: warningCount ? `${warningCount} item${warningCount === 1 ? "" : "s"} need attention.` : "No urgent reminders right now.",
      intro: warningCount ? "These are the workspace items that need attention." : "No urgent deadline or timer reminders are waiting right now.",
      badge: escapeHtml(input.workspaceName),
      body: [
        renderMetrics([
          { label: "Attention items", value: String(warningCount), tone: warningCount ? "warning" : "success" },
          { label: "Total reminders", value: String(input.notifications.length), tone: "neutral" }
        ]),
        renderSection("Reminder queue", input.notifications.length ? input.notifications.map(renderReminderCard).join("") : renderEmpty("All clear. Nothing urgent in this digest."))
      ].join("")
    })
  };
}

export function buildAdminErrorEmail(input: AdminErrorInput): EmailMessage {
  const statusCode = input.statusCode ?? 500;
  const subject = `[What's Next?] API error ${statusCode} ${input.method} ${input.route ?? input.path}`;
  const text = [
    "What's Next? API error alert",
    "",
    `Request ID: ${input.requestId}`,
    `Status: ${statusCode}`,
    `Method: ${input.method}`,
    `Path: ${input.path}`,
    `Route: ${input.route ?? "unknown"}`,
    `User ID: ${input.userId ?? "anonymous"}`,
    `Workspace ID: ${input.workspaceId ?? "none"}`,
    `IP: ${input.ip ?? "unknown"}`,
    `User agent: ${input.userAgent ?? "unknown"}`,
    `Started: ${input.startedAt.toISOString()}`,
    `Completed: ${input.completedAt.toISOString()}`,
    `Duration: ${input.durationMs}ms`,
    "",
    `Error: ${input.errorName ?? "Error"}`,
    `Message: ${input.errorMessage ?? "Unknown error"}`,
    "",
    "Query:",
    stringifyForEmail(input.query ?? {}),
    "",
    "Params:",
    stringifyForEmail(input.params ?? {}),
    "",
    "Body:",
    stringifyForEmail(input.body ?? {}),
    "",
    "Stack:",
    truncateText(input.stack ?? "", 4_000)
  ].join("\n");

  return {
    subject,
    text,
    html: renderLayout({
      title: `API error ${statusCode}`,
      preheader: `${input.method} ${input.route ?? input.path} failed in ${input.durationMs}ms.`,
      intro: "An API request failed and crossed the configured alert threshold.",
      badge: "Admin alert",
      accent: brand.error,
      body: [
        renderMetrics([
          { label: "Status", value: String(statusCode), tone: "error" },
          { label: "Duration", value: `${input.durationMs}ms`, tone: input.durationMs > 1000 ? "warning" : "neutral" },
          { label: "Request ID", value: input.requestId.slice(0, 8), tone: "neutral" }
        ]),
        renderDefinitionList([
          ["Request ID", input.requestId],
          ["Method", input.method],
          ["Path", input.path],
          ["Route", input.route ?? "unknown"],
          ["User", input.userId ?? "anonymous"],
          ["Workspace", input.workspaceId ?? "none"],
          ["IP", input.ip ?? "unknown"],
          ["User agent", input.userAgent ?? "unknown"],
          ["Started", input.startedAt.toISOString()],
          ["Completed", input.completedAt.toISOString()],
          ["Error", input.errorName ?? "Error"],
          ["Message", input.errorMessage ?? "Unknown error"]
        ]),
        renderCodeBlock("Query", stringifyForEmail(input.query ?? {})),
        renderCodeBlock("Params", stringifyForEmail(input.params ?? {})),
        renderCodeBlock("Request body", stringifyForEmail(input.body ?? {})),
        renderCodeBlock("Stack", truncateText(input.stack ?? "", 4_000) || "No stack captured.")
      ].join("")
    })
  };
}

function renderLayout(input: { title: string; preheader: string; intro: string; badge: string; body: string; accent?: string }) {
  const accent = input.accent ?? brand.primary;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;background:${brand.background};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${brand.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:${brand.card};border:1px solid ${brand.border};border-radius:24px;overflow:hidden;box-shadow:0 18px 60px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px 30px;background:linear-gradient(135deg,${accent},#2563EB);color:#fff;">
                <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">${brand.tagline}</div>
                <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.15;font-weight:800;">${escapeHtml(input.title)}</h1>
                <div style="display:inline-block;border:1px solid rgba(255,255,255,0.35);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;background:rgba(255,255,255,0.14);">${input.badge}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;">
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:${brand.muted};">${input.intro}</p>
                ${input.body}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 30px;background:#F8FAFC;border-top:1px solid ${brand.border};">
                <div style="font-size:13px;font-weight:800;color:${brand.ink};">${brand.name}</div>
                <div style="margin-top:4px;font-size:12px;color:${brand.muted};">A focused workspace for planning, notes, tasks, tickets, files, and AI assistance.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderMetrics(metrics: Array<{ label: string; value: string; tone: "neutral" | "success" | "warning" | "error" }>) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;"><tr>${metrics.map((metric) => {
    const color = toneColor(metric.tone);
    return `<td style="width:${Math.floor(100 / metrics.length)}%;padding:0 8px 8px 0;vertical-align:top;">
      <div style="border:1px solid ${brand.border};border-radius:16px;padding:14px;background:#FFFFFF;">
        <div style="font-size:12px;color:${brand.muted};">${escapeHtml(metric.label)}</div>
        <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:800;color:${color};">${escapeHtml(metric.value)}</div>
      </div>
    </td>`;
  }).join("")}</tr></table>`;
}

function renderSection(title: string, body: string) {
  return `<div style="margin:26px 0 0;">
    <h2 style="margin:0 0 12px;font-size:16px;line-height:1.3;color:${brand.ink};">${escapeHtml(title)}</h2>
    ${body}
  </div>`;
}

function renderTaskCard(task: DailySummaryTask) {
  const dueText = task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date";
  return `<div style="border:1px solid ${brand.border};border-radius:16px;padding:14px 16px;margin:0 0 10px;background:#FFFFFF;">
    <div style="font-size:14px;font-weight:800;color:${brand.ink};">${escapeHtml(task.title)}</div>
    <div style="margin-top:8px;font-size:12px;color:${brand.muted};">
      <span style="display:inline-block;margin-right:8px;border-radius:999px;background:#EEF2FF;color:${brand.primary};padding:4px 8px;font-weight:700;">${escapeHtml(formatStatus(task.status))}</span>
      <span style="display:inline-block;margin-right:8px;border-radius:999px;background:#F1F5F9;color:${brand.ink};padding:4px 8px;font-weight:700;">${escapeHtml(formatStatus(task.priority))}</span>
      <span>${escapeHtml(dueText)}</span>
    </div>
  </div>`;
}

function renderTimerCard(timer: DailySummaryTimer) {
  return `<div style="border:1px solid ${brand.border};border-radius:14px;padding:12px 14px;margin:0 0 8px;background:#FFFFFF;">
    <div style="font-size:14px;font-weight:700;color:${brand.ink};">${escapeHtml(timer.title)}</div>
    <div style="margin-top:6px;font-size:12px;color:${brand.muted};">${escapeHtml(formatDuration(timer.durationSec ?? timer.durationMin * 60))} tracked - ${escapeHtml(formatStatus(timer.status))}</div>
  </div>`;
}

function renderAiSummary(summary: AiSummary) {
  const providerLine = summary.providerLabel ? `<div style="margin-bottom:12px;font-size:12px;color:${brand.muted};">Generated by ${escapeHtml(summary.providerLabel)}${summary.model ? ` / ${escapeHtml(summary.model)}` : ""}</div>` : "";
  const body = renderMarkdownSummary(summary.content);
  return `<div style="border:1px solid #C7D2FE;border-radius:18px;background:#EEF2FF;padding:16px 18px;margin-bottom:18px;">
    ${providerLine}
    ${body || `<p style="margin:0;font-size:14px;line-height:1.7;color:${brand.ink};">No AI summary content was returned.</p>`}
  </div>`;
}

function renderMarkdownSummary(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let orderedList = false;

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:${brand.ink};">${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    const tag = orderedList ? "ol" : "ul";
    html.push(`<${tag} style="margin:0 0 12px 18px;padding:0;color:${brand.ink};font-size:14px;line-height:1.7;">${listItems.map((item) => `<li style="margin:0 0 6px;">${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    listItems = [];
    orderedList = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      html.push(`<h3 style="margin:16px 0 8px;font-size:15px;line-height:1.35;color:${brand.ink};font-weight:800;">${renderInlineMarkdown(heading[1])}</h3>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (orderedList) flushList();
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listItems.length && !orderedList) flushList();
      orderedList = true;
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line.replace(/^#{1,4}\s+/, ""));
  }

  flushParagraph();
  flushList();
  return html.join("");
}

function renderInlineMarkdown(value: string) {
  const placeholders: string[] = [];
  const escaped = escapeHtml(value).replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `@@CODE_${placeholders.length}@@`;
    placeholders.push(`<code style="border-radius:5px;background:rgba(79,70,229,0.10);color:${brand.primary};padding:1px 5px;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;">${code}</code>`);
    return token;
  });
  const formatted = escaped
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="font-weight:800;color:${brand.ink};">$1</strong>`)
    .replace(/__([^_]+)__/g, `<strong style="font-weight:800;color:${brand.ink};">$1</strong>`)
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, `<em style="font-style:italic;">$1</em>`)
    .replace(/_([^_\n]+)_/g, `<em style="font-style:italic;">$1</em>`);
  return placeholders.reduce((result, replacement, index) => result.replace(`@@CODE_${index}@@`, replacement), formatted);
}

function renderReminderCard(notification: ReminderNotification) {
  const color = notification.tone === "warning" ? brand.warning : notification.tone === "success" ? brand.success : brand.primary;
  return `<div style="border:1px solid ${brand.border};border-left:4px solid ${color};border-radius:16px;padding:14px 16px;margin:0 0 10px;background:#FFFFFF;">
    <div style="font-size:14px;font-weight:800;color:${brand.ink};">${escapeHtml(notification.title)}</div>
    <div style="margin-top:6px;font-size:13px;line-height:1.6;color:${brand.muted};">${escapeHtml(notification.body)}</div>
  </div>`;
}

function renderDefinitionList(items: Array<[string, string]>) {
  return `<div style="border:1px solid ${brand.border};border-radius:16px;overflow:hidden;background:#FFFFFF;margin:0 0 18px;">
    ${items.map(([label, value], index) => `<div style="padding:11px 14px;${index ? `border-top:1px solid ${brand.border};` : ""}">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${brand.muted};">${escapeHtml(label)}</div>
      <div style="margin-top:4px;font-size:13px;line-height:1.5;color:${brand.ink};word-break:break-word;">${escapeHtml(value)}</div>
    </div>`).join("")}
  </div>`;
}

function renderCodeBlock(title: string, value: string) {
  return `<div style="margin:18px 0 0;">
    <div style="font-size:13px;font-weight:800;color:${brand.ink};margin-bottom:8px;">${escapeHtml(title)}</div>
    <pre style="white-space:pre-wrap;word-break:break-word;margin:0;border-radius:14px;border:1px solid #CBD5E1;background:#0F172A;color:#E2E8F0;padding:14px;font-size:12px;line-height:1.55;font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(value)}</pre>
  </div>`;
}

function renderActionButton(label: string, url: string) {
  return `<div style="margin:24px 0;">
    <a href="${escapeAttribute(url)}" style="display:inline-block;border-radius:12px;background:${brand.primary};color:#FFFFFF;padding:12px 18px;text-decoration:none;font-size:14px;font-weight:800;">${escapeHtml(label)}</a>
  </div>`;
}

function renderInfoBox(title: string, body: string) {
  return `<div style="border:1px solid ${brand.border};border-radius:16px;background:#F8FAFC;padding:14px 16px;margin-top:18px;">
    <div style="font-size:13px;font-weight:800;color:${brand.ink};">${escapeHtml(title)}</div>
    <div style="margin-top:6px;font-size:13px;line-height:1.6;color:${brand.muted};">${escapeHtml(body)}</div>
  </div>`;
}

function renderEmpty(text: string) {
  return `<div style="border:1px dashed #CBD5E1;border-radius:16px;background:#F8FAFC;padding:16px;color:${brand.muted};font-size:13px;line-height:1.6;">${escapeHtml(text)}</div>`;
}

function formatTaskLine(task: DailySummaryTask) {
  return `- ${task.title} [${formatStatus(task.status)}, ${formatStatus(task.priority)}${task.dueDate ? `, due ${formatDate(task.dueDate)}` : ""}]`;
}

function uniqueTasks(tasks: DailySummaryTask[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = `${task.title}|${task.status}|${task.priority}|${task.dueDate?.toISOString() ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toneColor(tone: "neutral" | "success" | "warning" | "error") {
  if (tone === "success") return brand.success;
  if (tone === "warning") return brand.warning;
  if (tone === "error") return brand.error;
  return brand.ink;
}

function stringifyForEmail(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

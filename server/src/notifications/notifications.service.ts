import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiService } from "../ai/ai.service";
import { buildDailySummaryEmail, buildReminderDigestEmail, EmailMessage } from "../common/email/email-templates";
import { PrismaService } from "../prisma/prisma.service";

type WorkspaceNotification = {
  id: string;
  title: string;
  body: string;
  tone?: "default" | "warning" | "success";
  createdAt: string;
  source: "system" | "workspace";
};

type DailySummaryTaskRecord = {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  timeEstimate: number | null;
  actualTime: number;
  customFields: unknown;
  updatedAt: Date;
};

type DailySummaryTimeRecord = {
  title: string;
  durationMin: number;
  durationSec: number;
  status: string;
  startedAt: Date;
  task: { title: string; status: string; priority: string } | null;
};

const dailySummarySystemPrompt = [
  "You are What's Next?'s daily workspace briefing assistant.",
  "Write a helpful, email-ready daily summary from only the workspace facts provided.",
  "Do not invent tasks, blockers, completed work, customers, deadlines, root causes, or time entries.",
  "If context is thin, say what is known and what is missing.",
  "Use clear short sections: Top focus, Progress, Risks or blockers, Next actions.",
  "Keep it concise, professional, and specific. Do not output JSON."
].join(" ");

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly scheduledDailyRuns = new Set<string>();
  private reminderInterval?: NodeJS.Timeout;
  private dailySummaryInterval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ai: AiService
  ) {}

  onModuleInit() {
    if (this.config.get<string>("ENABLE_SCHEDULED_NOTIFICATIONS") !== "true") return;

    const reminderMinutes = Number(this.config.get<string>("SCHEDULED_REMINDER_INTERVAL_MINUTES") ?? 60);
    this.reminderInterval = setInterval(() => {
      void this.sendScheduledDeadlineReminders();
    }, Math.max(15, reminderMinutes) * 60_000);

    this.dailySummaryInterval = setInterval(() => {
      void this.sendScheduledDailySummaries();
    }, 60 * 60_000);

    void this.sendScheduledDeadlineReminders();
    void this.sendScheduledDailySummaries();
  }

  onModuleDestroy() {
    if (this.reminderInterval) clearInterval(this.reminderInterval);
    if (this.dailySummaryInterval) clearInterval(this.dailySummaryInterval);
  }

  async list(userId: string, workspaceId: string): Promise<WorkspaceNotification[]> {
    await this.assertWorkspaceAccess(userId, workspaceId);
    const [stored, tasks, timers] = await Promise.all([
      this.prisma.notification.findMany({
        where: { workspaceId, readAt: null },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      this.prisma.task.findMany({
        where: { workspaceId, deletedAt: null, status: { notIn: ["DONE", "CANCELED"] }, dueDate: { not: null } },
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 50
      }),
      this.prisma.timeEntry.findMany({
        where: { userId, workspaceId, status: "RUNNING" },
        select: { id: true, title: true, startedAt: true },
        orderBy: { startedAt: "asc" },
        take: 5
      })
    ]);

    const now = new Date();
    const todayKey = toDateKey(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = toDateKey(tomorrow);

    const generated = tasks.flatMap((task): WorkspaceNotification[] => {
      if (!task.dueDate) return [];
      const dueKey = toDateKey(task.dueDate);
      if (dueKey < todayKey) {
        return [{ id: `system-overdue-${task.id}`, title: "Overdue task", body: `${task.title} was due ${task.dueDate.toLocaleDateString()}.`, tone: "warning", createdAt: now.toISOString(), source: "system" }];
      }
      if (dueKey === todayKey) {
        return [{ id: `system-due-today-${task.id}`, title: "Due today", body: `${task.title} is due today.`, tone: "warning", createdAt: now.toISOString(), source: "system" }];
      }
      if (dueKey === tomorrowKey) {
        return [{ id: `system-due-tomorrow-${task.id}`, title: "Due tomorrow", body: `${task.title} is due tomorrow.`, createdAt: now.toISOString(), source: "system" }];
      }
      return [];
    });

    for (const timer of timers) {
      const minutes = Math.round((now.getTime() - timer.startedAt.getTime()) / 60_000);
      if (minutes >= 60) {
        generated.unshift({ id: `system-timer-${timer.id}`, title: "Timer still running", body: `${timer.title} has been running for ${minutes} minutes.`, tone: "warning", createdAt: now.toISOString(), source: "system" });
      }
    }

    return [
      ...generated,
      ...stored.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt.toISOString(),
        source: "workspace" as const
      }))
    ].slice(0, 20);
  }

  async sendDailySummary(userId: string, workspaceId: string) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    const [user, workspace, tasks, timers] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } }),
      this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
      this.prisma.task.findMany({
        where: { workspaceId, deletedAt: null },
        select: { title: true, description: true, status: true, priority: true, dueDate: true, timeEstimate: true, actualTime: true, customFields: true, updatedAt: true },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 40
      }),
      this.prisma.timeEntry.findMany({
        where: { userId, workspaceId, createdAt: { gte: startOfToday() } },
        select: { title: true, durationMin: true, durationSec: true, status: true, startedAt: true, task: { select: { title: true, status: true, priority: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);

    const aiSummary = await this.generateAiDailySummary(userId, workspace.name, user.name, tasks, timers);
    const email = buildDailySummaryEmail({
      workspaceName: workspace.name,
      userName: user.name,
      tasks,
      timers,
      aiSummary
    });
    await this.sendEmail(user.email, email);
    await this.prisma.notification.create({
      data: {
        workspaceId,
        title: "Daily summary emailed",
        body: `A daily summary was sent to ${user.email}.`
      }
    });

    return { delivered: true, subject: email.subject, body: email.text, ai: aiSummary };
  }

  async sendDeadlineReminders(userId: string, workspaceId: string) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    const [user, workspace, notifications] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
      this.list(userId, workspaceId)
    ]);

    const actionable = notifications.filter((notification) => notification.title.includes("Due") || notification.title.includes("Overdue") || notification.title.includes("Timer"));
    const email = buildReminderDigestEmail({ workspaceName: workspace.name, notifications: actionable });
    await this.sendEmail(user.email, email);

    await this.prisma.notification.create({
      data: {
        workspaceId,
        title: "Reminder digest emailed",
        body: `Deadline and timer reminders were sent to ${user.email}.`
      }
    });

    return { delivered: true, subject: email.subject, body: email.text };
  }

  private async generateAiDailySummary(userId: string, workspaceName: string, userName: string, tasks: DailySummaryTaskRecord[], timers: DailySummaryTimeRecord[]) {
    const prompt = buildAiDailySummaryPrompt({ workspaceName, userName, tasks, timers, now: new Date() });
    const result = await this.ai.generateText(userId, prompt, dailySummarySystemPrompt);
    return {
      content: normalizeAiSummary(result.content),
      providerLabel: result.providerLabel,
      model: result.model
    };
  }

  private async sendScheduledDeadlineReminders() {
    const workspaces = await this.prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, ownerId: true }
    });

    for (const workspace of workspaces) {
      try {
        await this.sendDeadlineReminders(workspace.ownerId, workspace.id);
      } catch (error) {
        this.logger.warn(`Scheduled reminders failed for workspace ${workspace.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  private async sendScheduledDailySummaries() {
    const configuredHour = Number(this.config.get<string>("SCHEDULED_DAILY_SUMMARY_HOUR") ?? 8);
    if (new Date().getHours() !== Math.min(23, Math.max(0, configuredHour))) return;

    const workspaces = await this.prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, ownerId: true }
    });
    const dateKey = toDateKey(new Date());

    for (const workspace of workspaces) {
      const runKey = `${dateKey}:${workspace.id}`;
      if (this.scheduledDailyRuns.has(runKey)) continue;
      this.scheduledDailyRuns.add(runKey);
      try {
        await this.sendDailySummary(workspace.ownerId, workspace.id);
      } catch (error) {
        this.logger.warn(`Scheduled daily summary failed for workspace ${workspace.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  private async sendEmail(to: string, email: EmailMessage) {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    const from = this.config.get<string>("EMAIL_FROM", "What's Next? <noreply@whatsnext.local>");
    if (!apiKey || !from) throw new ServiceUnavailableException("Email delivery is not configured.");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject: email.subject,
        text: email.text,
        html: email.html
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.warn(`Resend email failed: ${body || response.statusText}`);
      throw new ServiceUnavailableException("Email delivery failed.");
    }
    return true;
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildAiDailySummaryPrompt(input: { workspaceName: string; userName: string; tasks: DailySummaryTaskRecord[]; timers: DailySummaryTimeRecord[]; now: Date }) {
  const taskFacts = input.tasks.length
    ? input.tasks.map((task, index) => formatTaskForAi(task, index)).join("\n\n")
    : "No tasks found in the latest workspace window.";
  const timerFacts = input.timers.length
    ? input.timers.map((timer, index) => formatTimerForAi(timer, index)).join("\n")
    : "No time entries recorded today.";
  const openCount = input.tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELED").length;
  const completedCount = input.tasks.filter((task) => task.status === "DONE").length;
  const trackedSeconds = input.timers.reduce((sum, timer) => sum + timer.durationSec, 0);

  return [
    `Workspace: ${input.workspaceName}`,
    `User: ${input.userName}`,
    `Current date: ${input.now.toISOString().slice(0, 10)}`,
    "",
    "Summary metrics:",
    `- Open tasks in provided window: ${openCount}`,
    `- Completed tasks in provided window: ${completedCount}`,
    `- Time tracked today: ${formatDuration(trackedSeconds)}`,
    "",
    "Tasks:",
    taskFacts,
    "",
    "Today's time entries:",
    timerFacts,
    "",
    "Write the daily summary email content now.",
    "Use these exact sections:",
    "## Top focus",
    "## Progress",
    "## Risks or blockers",
    "## Next actions",
    "",
    "Rules:",
    "- Use only the facts above.",
    "- Mention concrete task names and dates when useful.",
    "- Prioritize overdue, due-today, high-priority, in-progress, and blocked work.",
    "- Include progress notes when they are present.",
    "- If there is not enough context for a section, say what is missing instead of guessing.",
    "- Keep the whole response under 220 words."
  ].join("\n");
}

function formatTaskForAi(task: DailySummaryTaskRecord, index: number) {
  const customFields = readRecord(task.customFields);
  const progress = readNumber(customFields.progress);
  const latestNote = latestTaskNote(customFields.notes);
  const startDate = readString(customFields.startDate);
  const severity = readString(customFields.severity);
  const customer = readString(customFields.customer);
  const investigation = readString(customFields.investigation);
  const resolution = readString(customFields.resolution);
  const closureNotes = readString(customFields.closureNotes);
  const acceptanceCriteria = readString(customFields.acceptanceCriteria);
  return [
    `T${index + 1}: ${task.title}`,
    `Status: ${formatLabel(task.status)}; Priority: ${formatLabel(task.priority)}${task.dueDate ? `; Due: ${task.dueDate.toISOString().slice(0, 10)}` : ""}; Updated: ${task.updatedAt.toISOString().slice(0, 10)}`,
    startDate ? `Start date: ${startDate}` : "",
    typeof progress === "number" ? `Progress: ${progress}%` : "",
    typeof task.actualTime === "number" || typeof task.timeEstimate === "number" ? `Time: ${formatMinutes(task.actualTime)} spent${typeof task.timeEstimate === "number" ? ` of ${formatMinutes(task.timeEstimate)} estimated` : ""}` : "",
    task.description ? `Description: ${truncateText(task.description, 260)}` : "",
    severity ? `Severity: ${severity}` : "",
    customer ? `Customer: ${customer}` : "",
    investigation ? `Investigation: ${truncateText(investigation, 220)}` : "",
    resolution ? `Resolution: ${truncateText(resolution, 220)}` : "",
    closureNotes ? `Closure notes: ${truncateText(closureNotes, 220)}` : "",
    acceptanceCriteria ? `Acceptance criteria: ${truncateText(acceptanceCriteria, 220)}` : "",
    latestNote ? `Latest progress note: ${latestNote.body}${latestNote.createdAt ? ` (${latestNote.createdAt})` : ""}` : ""
  ].filter(Boolean).join("\n");
}

function formatTimerForAi(timer: DailySummaryTimeRecord, index: number) {
  return [
    `E${index + 1}: ${timer.title}`,
    `Duration: ${formatDuration(timer.durationSec)}; Status: ${formatLabel(timer.status)}; Started: ${timer.startedAt.toISOString()}`,
    timer.task ? `Linked task: ${timer.task.title} [${formatLabel(timer.task.status)}, ${formatLabel(timer.task.priority)}]` : ""
  ].filter(Boolean).join(" ");
}

function normalizeAiSummary(content: string) {
  return content.trim().replace(/^```(?:text|markdown)?/i, "").replace(/```$/i, "").trim();
}

function latestTaskNote(value: unknown) {
  const notes = Array.isArray(value) ? value.filter(isRecord) : [];
  const first = notes[0];
  if (!first) return null;
  const body = readString(first.body);
  if (!body) return null;
  return {
    body: truncateText(body, 220),
    createdAt: readString(first.createdAt)
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMinutes(value: number) {
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
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

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

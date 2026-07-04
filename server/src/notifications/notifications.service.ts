import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

type WorkspaceNotification = {
  id: string;
  title: string;
  body: string;
  tone?: "default" | "warning" | "success";
  createdAt: string;
  source: "system" | "workspace";
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly scheduledDailyRuns = new Set<string>();
  private reminderInterval?: NodeJS.Timeout;
  private dailySummaryInterval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
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
        select: { title: true, status: true, priority: true, dueDate: true },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 20
      }),
      this.prisma.timeEntry.findMany({
        where: { userId, workspaceId, createdAt: { gte: startOfToday() } },
        select: { title: true, durationMin: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 10
      })
    ]);

    const subject = `What's Next? daily summary - ${workspace.name}`;
    const body = this.buildDailySummary(workspace.name, tasks, timers);
    await this.sendEmail(user.email, subject, body);
    await this.prisma.notification.create({
      data: {
        workspaceId,
        title: "Daily summary emailed",
        body: `A daily summary was sent to ${user.email}.`
      }
    });

    return { delivered: true, subject, body };
  }

  async sendDeadlineReminders(userId: string, workspaceId: string) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    const [user, workspace, notifications] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
      this.list(userId, workspaceId)
    ]);

    const actionable = notifications.filter((notification) => notification.title.includes("Due") || notification.title.includes("Overdue") || notification.title.includes("Timer"));
    const subject = `What's Next? reminders - ${workspace.name}`;
    const body = [
      `Reminder digest for ${workspace.name}`,
      "",
      ...(actionable.length ? actionable.map((notification) => `- ${notification.title}: ${notification.body}`) : ["- No urgent reminders right now."])
    ].join("\n");
    await this.sendEmail(user.email, subject, body);

    await this.prisma.notification.create({
      data: {
        workspaceId,
        title: "Reminder digest emailed",
        body: `Deadline and timer reminders were sent to ${user.email}.`
      }
    });

    return { delivered: true, subject, body };
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

  private buildDailySummary(workspaceName: string, tasks: Array<{ title: string; status: string; priority: string; dueDate: Date | null }>, timers: Array<{ title: string; durationMin: number; status: string }>) {
    const today = toDateKey(new Date());
    const open = tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
    const dueToday = open.filter((task) => task.dueDate && toDateKey(task.dueDate) <= today).slice(0, 6);
    const completed = tasks.filter((task) => task.status === "DONE").slice(0, 5);
    const minutes = timers.reduce((sum, timer) => sum + timer.durationMin, 0);

    return [
      `Daily summary for ${workspaceName}`,
      "",
      `Open work: ${open.length}`,
      `Tracked today: ${minutes} minutes`,
      "",
      "Priority tasks:",
      ...(dueToday.length ? dueToday.map((task) => `- ${task.title} (${task.priority})`) : ["- No overdue or due-today tasks."]),
      "",
      "Completed recently:",
      ...(completed.length ? completed.map((task) => `- ${task.title}`) : ["- No completed tasks in the latest task window."])
    ].join("\n");
  }

  private async sendEmail(to: string, subject: string, text: string) {
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
        subject,
        text
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

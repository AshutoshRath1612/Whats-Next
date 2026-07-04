import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(userId: string, workspaceId: string) {
    if (!workspaceId) throw new BadRequestException("workspaceId is required");
    await this.assertWorkspaceAccess(userId, workspaceId);

    const weekDays = getRecentWeekDays(7);
    const windowStart = new Date(weekDays[0].date);
    const today = startOfDay(new Date());
    const currentWeek = getCurrentWeekRange(today);
    const [tasks, projects, legacyTickets, recentNotes, runningTimers, timeEntries] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId, deletedAt: null },
        select: { status: true, priority: true, dueDate: true, createdAt: true, updatedAt: true, customFields: true }
      }),
      this.prisma.project.findMany({ where: { workspaceId, deletedAt: null, isPinned: true }, take: 5 }),
      this.prisma.ticket.count({ where: { workspaceId, deletedAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
      this.prisma.note.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 5 }),
      this.prisma.timeEntry.findMany({ where: { userId, workspaceId, status: "RUNNING" }, take: 3 }),
      this.prisma.timeEntry.findMany({
        where: { userId, workspaceId, createdAt: { gte: windowStart } },
        select: { createdAt: true, durationMin: true, durationSec: true, status: true, startedAt: true }
      })
    ]);
    const openTasks = tasks.filter((task) => task.status !== "DONE").length;
    const completedTasks = tasks.filter((task) => task.status === "DONE").length;
    const overdueTasks = tasks.filter((task) => task.status !== "DONE" && task.dueDate && startOfDay(task.dueDate).getTime() < today.getTime()).length;
    const dueThisWeek = tasks.filter((task) => task.status !== "DONE" && task.dueDate && task.dueDate >= currentWeek.start && task.dueDate < currentWeek.end).length;
    const pendingTasks = tasks.filter((task) => task.status === "PENDING").length;
    const inProgressTasks = tasks.filter((task) => task.status === "IN_PROGRESS").length;
    const ticketTasks = tasks.filter((task) => task.status !== "DONE" && readCustomField(task.customFields, "workType") === "Ticket").length;

    return {
      counts: {
        openTasks,
        completedTasks,
        projects: projects.length,
        tickets: legacyTickets + ticketTasks,
        overdueTasks,
        dueThisWeek,
        pendingTasks,
        inProgressTasks
      },
      pinnedProjects: projects,
      recentNotes,
      runningTimers,
      weeklyProgress: weekDays.map((day) => {
        const dayEnd = new Date(day.date);
        dayEnd.setDate(dayEnd.getDate() + 1);
        return {
          day: day.label,
          completed: tasks.filter((task) => task.status === "DONE" && toDateKey(task.updatedAt) === day.key).length,
          created: tasks.filter((task) => toDateKey(task.createdAt) === day.key).length,
          due: tasks.filter((task) => task.dueDate && toDateKey(task.dueDate) === day.key).length,
          overdue: tasks.filter((task) => task.status !== "DONE" && task.dueDate && startOfDay(task.dueDate).getTime() < startOfDay(dayEnd).getTime()).length,
          open: tasks.filter((task) => task.status !== "DONE" && task.createdAt < dayEnd).length,
          focusedSeconds: timeEntries
            .filter((entry) => toDateKey(entry.createdAt) === day.key)
            .reduce((total, entry) => total + entry.durationSec + (entry.status === "RUNNING" ? currentRunSeconds(entry.startedAt) : 0), 0),
          focusedMinutes: timeEntries
            .filter((entry) => toDateKey(entry.createdAt) === day.key)
            .reduce((total, entry) => total + Math.floor((entry.durationSec + (entry.status === "RUNNING" ? currentRunSeconds(entry.startedAt) : 0)) / 60), 0)
        };
      })
    };
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }
}

function getRecentWeekDays(count: number) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    date.setHours(0, 0, 0, 0);
    return {
      date,
      key: toDateKey(date),
      label: date.toLocaleDateString("en-US", { weekday: "short" })
    };
  });
}

function toDateKey(date: Date) {
  const localDate = startOfDay(date);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
}

function currentRunSeconds(startedAt: Date) {
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getCurrentWeekRange(today: Date) {
  const start = startOfDay(today);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function readCustomField(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

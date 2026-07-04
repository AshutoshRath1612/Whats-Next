import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TimerStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ManualTimeEntryDto, StartTimeEntryDto } from "./dto";

@Injectable()
export class TimeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string) {
    if (!workspaceId) throw new BadRequestException("workspaceId is required");
    await this.assertWorkspaceAccess(userId, workspaceId);
    return this.prisma.timeEntry.findMany({
      where: { userId, workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async start(userId: string, dto: StartTimeEntryDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    if (dto.taskId) await this.assertTaskAccess(userId, dto.taskId, dto.workspaceId);

    await this.pauseRunningTimers(userId);
    return this.prisma.timeEntry.create({
      data: {
        workspaceId: dto.workspaceId,
        userId,
        taskId: dto.taskId,
        title: dto.title,
        status: "RUNNING",
        startedAt: new Date(),
        durationMin: 0,
        durationSec: 0
      }
    });
  }

  async manual(userId: string, dto: ManualTimeEntryDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    if (dto.taskId) await this.assertTaskAccess(userId, dto.taskId, dto.workspaceId);

    return this.prisma.timeEntry.create({
      data: {
        workspaceId: dto.workspaceId,
        userId,
        taskId: dto.taskId,
        title: dto.title,
        status: "STOPPED",
        startedAt: new Date(),
        endedAt: new Date(),
        durationMin: dto.minutes,
        durationSec: dto.minutes * 60
      }
    });
  }

  async toggle(userId: string, id: string) {
    const entry = await this.findUserEntry(userId, id);
    if (entry.status === "STOPPED") return entry;

    if (entry.status === "RUNNING") {
      const durationSec = this.durationWithCurrentRunSeconds(entry.durationSec, entry.startedAt);
      return this.prisma.timeEntry.update({
        where: { id },
        data: {
          status: "PAUSED",
          durationMin: this.secondsToMinutes(durationSec),
          durationSec
        }
      });
    }

    await this.pauseRunningTimers(userId);
    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        status: "RUNNING",
        startedAt: new Date()
      }
    });
  }

  async stop(userId: string, id: string) {
    const entry = await this.findUserEntry(userId, id);
    if (entry.status === "STOPPED") return entry;
    const durationSec = entry.status === "RUNNING" ? this.durationWithCurrentRunSeconds(entry.durationSec, entry.startedAt) : entry.durationSec;

    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        status: "STOPPED",
        endedAt: new Date(),
        durationMin: this.secondsToMinutes(durationSec),
        durationSec
      }
    });
  }

  private async pauseRunningTimers(userId: string) {
    const running = await this.prisma.timeEntry.findMany({ where: { userId, status: "RUNNING" } });
    await Promise.all(running.map((entry) => {
      const durationSec = this.durationWithCurrentRunSeconds(entry.durationSec, entry.startedAt);
      return this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          status: "PAUSED",
          durationMin: this.secondsToMinutes(durationSec),
          durationSec
        }
      });
    }));
  }

  private async findUserEntry(userId: string, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!entry) throw new NotFoundException("Time entry not found");
    return entry;
  }

  private async assertTaskAccess(userId: string, taskId: string, workspaceId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { workspaceId: true }
    });
    if (!task) throw new BadRequestException("Task not found");
    if (task.workspaceId !== workspaceId) throw new BadRequestException("Task does not belong to this workspace");

    await this.assertWorkspaceAccess(userId, task.workspaceId);
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });
    if (!membership) throw new ForbiddenException("Workspace access denied");
  }

  private durationWithCurrentRunSeconds(durationSec: number, startedAt: Date) {
    return durationSec + Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  }

  private secondsToMinutes(durationSec: number) {
    return Math.floor(durationSec / 60);
  }
}

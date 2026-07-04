import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TaskStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto, UpdateTaskDto } from "./dto";
import { writeAuditLog } from "../common/audit";

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);

    return this.prisma.task.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: query.q ? [{ title: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }] : undefined
      },
      include: { project: { select: { id: true, name: true, color: true } }, _count: { select: { subtasks: true, comments: true } } },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "updatedAt" ? [{ updatedAt: query.sortDir }] : [{ dueDate: "asc" }, { updatedAt: "desc" }]
    });
  }

  async create(userId: string, dto: CreateTaskDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    if (dto.projectId) await this.assertProjectInWorkspace(dto.projectId, dto.workspaceId);

    const created = await this.prisma.task.create({
      data: this.toCreateData(dto),
      include: { project: { select: { id: true, name: true, color: true } }, _count: { select: { subtasks: true, comments: true } } }
    });
    await writeAuditLog(this.prisma, { workspaceId: dto.workspaceId, userId, action: "create", entityType: "task", entityId: created.id, after: created });
    return created;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const task = await this.findAccessibleTask(userId, id);
    if (dto.status) this.assertValidStatus(dto.status);

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: this.toUpdateData(dto),
      include: { project: { select: { id: true, name: true, color: true } }, _count: { select: { subtasks: true, comments: true } } }
    });
    await writeAuditLog(this.prisma, { workspaceId: task.workspaceId, userId, action: "update", entityType: "task", entityId: updated.id, after: updated });
    return updated;
  }

  async updateStatus(userId: string, id: string, status: string) {
    const task = await this.findAccessibleTask(userId, id);
    this.assertValidStatus(status);

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: { status: status as TaskStatus },
      include: { project: { select: { id: true, name: true, color: true } }, _count: { select: { subtasks: true, comments: true } } }
    });
    await writeAuditLog(this.prisma, { workspaceId: task.workspaceId, userId, action: "status", entityType: "task", entityId: updated.id, after: { status } });
    return updated;
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }

  private async assertProjectInWorkspace(projectId: string, workspaceId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId, deletedAt: null }, select: { id: true } });
    if (!project) throw new BadRequestException("Project does not belong to this workspace");
  }

  private async findAccessibleTask(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, workspaceId: true }
    });

    if (!task) throw new NotFoundException("Task not found");
    await this.assertWorkspaceAccess(userId, task.workspaceId);
    return task;
  }

  private assertValidStatus(status: string) {
    if (!Object.values(TaskStatus).includes(status as TaskStatus)) {
      throw new BadRequestException("Invalid task status");
    }
  }

  private toCreateData(dto: CreateTaskDto): Prisma.TaskCreateInput {
    return {
      workspace: { connect: { id: dto.workspaceId } },
      project: dto.projectId ? { connect: { id: dto.projectId } } : undefined,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: dto.status,
      recurringRule: dto.recurringRule,
      labels: dto.labels ?? [],
      tags: dto.tags ?? [],
      checklist: (dto.checklist ?? []) as Prisma.InputJsonValue,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      timeEstimate: dto.timeEstimate,
      actualTime: dto.actualTime,
      customFields: (dto.customFields ?? {}) as Prisma.InputJsonValue
    };
  }

  private toUpdateData(dto: UpdateTaskDto): Prisma.TaskUpdateInput {
    return {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: dto.status,
      recurringRule: dto.recurringRule,
      labels: dto.labels,
      tags: dto.tags,
      checklist: dto.checklist as Prisma.InputJsonValue | undefined,
      dueDate: dto.dueDate === null ? null : dto.dueDate ? new Date(dto.dueDate) : undefined,
      timeEstimate: dto.timeEstimate,
      actualTime: dto.actualTime,
      customFields: dto.customFields as Prisma.InputJsonValue | undefined
    };
  }
}

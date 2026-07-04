import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProjectDto, UpdateProjectDto } from "./dto";
import { writeAuditLog } from "../common/audit";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }, includeArchived = false) {
    await this.assertWorkspaceAccess(userId, workspaceId);

    return this.prisma.project.findMany({
      where: {
        workspaceId,
        ...(includeArchived ? {} : { deletedAt: null }),
        OR: query.q ? [{ name: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }] : undefined
      },
      include: { _count: { select: { tasks: true, notes: true, tickets: true } } },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "name" ? [{ name: query.sortDir }] : [{ isPinned: "desc" }, { updatedAt: "desc" }]
    });
  }

  async create(userId: string, dto: CreateProjectDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);

    const created = await this.prisma.project.create({
      data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined }
    });
    await writeAuditLog(this.prisma, { workspaceId: dto.workspaceId, userId, action: "create", entityType: "project", entityId: created.id, after: created });
    return created;
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    const project = await this.findAccessibleProject(userId, id);

    const updated = await this.prisma.project.update({
      where: { id: project.id },
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        coverUrl: dto.coverUrl,
        color: dto.color,
        progress: dto.progress,
        isPinned: dto.isPinned,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined
      }
    });
    await writeAuditLog(this.prisma, { workspaceId: project.workspaceId, userId, action: "update", entityType: "project", entityId: updated.id, after: updated });
    return updated;
  }

  async archive(userId: string, id: string) {
    const project = await this.findAccessibleProject(userId, id);

    const archived = await this.prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date(), status: "archived", isPinned: false }
    });
    await writeAuditLog(this.prisma, { workspaceId: project.workspaceId, userId, action: "archive", entityType: "project", entityId: archived.id, after: { status: "archived" } });
    return archived;
  }

  async unarchive(userId: string, id: string) {
    const project = await this.findAccessibleProject(userId, id, true);

    const restored = await this.prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: null, status: "active" }
    });
    await writeAuditLog(this.prisma, { workspaceId: project.workspaceId, userId, action: "unarchive", entityType: "project", entityId: restored.id, after: { status: "active" } });
    return restored;
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }

  private async findAccessibleProject(userId: string, id: string, includeArchived = false) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...(includeArchived ? {} : { deletedAt: null }) },
      select: { id: true, workspaceId: true }
    });

    if (!project) throw new NotFoundException("Project not found");
    await this.assertWorkspaceAccess(userId, project.workspaceId);
    return project;
  }
}

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWorkspaceDto, UpdateWorkspaceDto } from "./dto";
import { writeAuditLog } from "../common/audit";

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { deletedAt: null, members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { projects: true, tasks: true, notes: true, tickets: true } } }
    });
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    await this.assertSlugAvailable(dto.slug);
    const created = await this.prisma.workspace.create({
      data: {
        ...dto,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } }
      }
    });
    await writeAuditLog(this.prisma, { workspaceId: created.id, userId, action: "create", entityType: "workspace", entityId: created.id, after: created });
    return created;
  }

  async update(userId: string, id: string, dto: UpdateWorkspaceDto) {
    await this.assertOwnerAccess(userId, id);
    if (dto.slug) await this.assertSlugAvailable(dto.slug, id);

    const updated = await this.prisma.workspace.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        icon: dto.icon,
        color: dto.color
      },
      include: { _count: { select: { projects: true, tasks: true, notes: true, tickets: true } } }
    });
    await writeAuditLog(this.prisma, { workspaceId: id, userId, action: "update", entityType: "workspace", entityId: id, after: updated });
    return updated;
  }

  async archive(userId: string, id: string) {
    await this.assertOwnerAccess(userId, id);
    const archived = await this.prisma.workspace.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    await writeAuditLog(this.prisma, { workspaceId: id, userId, action: "archive", entityType: "workspace", entityId: id });
    return archived;
  }

  private async assertOwnerAccess(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { ownerId: true }
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    if (workspace.ownerId !== userId) throw new ForbiddenException("Only the workspace owner can change this workspace");
  }

  private async assertSlugAvailable(slug: string, exceptWorkspaceId?: string) {
    const existing = await this.prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (existing && existing.id !== exceptWorkspaceId) throw new ConflictException("Workspace slug is already in use");
  }
}

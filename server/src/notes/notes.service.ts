import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateNoteDto, UpdateNoteDto } from "./dto";

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);

    return this.prisma.note.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: query.q ? [{ title: { contains: query.q, mode: "insensitive" } }, { content: { contains: query.q, mode: "insensitive" } }] : undefined
      },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "title" ? [{ title: query.sortDir }] : [{ isPinned: "desc" }, { updatedAt: "desc" }],
      include: { versions: { orderBy: { savedAt: "desc" }, take: 20 } }
    });
  }

  async create(userId: string, dto: CreateNoteDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    if (dto.projectId) await this.assertProjectInWorkspace(dto.projectId, dto.workspaceId);

    return this.prisma.note.create({
      data: this.toCreateData(dto),
      include: { versions: { orderBy: { savedAt: "desc" }, take: 20 } }
    });
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    const note = await this.findAccessibleNote(userId, id);
    if (dto.projectId) await this.assertProjectInWorkspace(dto.projectId, note.workspaceId);

    return this.prisma.$transaction(async (tx) => {
      await tx.noteVersion.create({
        data: {
          noteId: note.id,
          workspaceId: note.workspaceId,
          projectId: note.projectId,
          title: note.title,
          content: note.content,
          tags: note.tags,
          isPinned: note.isPinned
        }
      });

      const oldVersions = await tx.noteVersion.findMany({
        where: { noteId: note.id },
        orderBy: { savedAt: "desc" },
        skip: 20,
        select: { id: true }
      });
      if (oldVersions.length) {
        await tx.noteVersion.deleteMany({ where: { id: { in: oldVersions.map((version) => version.id) } } });
      }

      return tx.note.update({
        where: { id: note.id },
        data: this.toUpdateData(dto),
        include: { versions: { orderBy: { savedAt: "desc" }, take: 20 } }
      });
    });
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

  private async findAccessibleNote(userId: string, id: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, workspaceId: true, projectId: true, title: true, content: true, tags: true, isPinned: true }
    });

    if (!note) throw new NotFoundException("Note not found");
    await this.assertWorkspaceAccess(userId, note.workspaceId);
    return note;
  }

  private toCreateData(dto: CreateNoteDto): Prisma.NoteUncheckedCreateInput {
    return {
      workspaceId: dto.workspaceId,
      projectId: dto.projectId,
      title: dto.title,
      content: dto.content,
      tags: dto.tags ?? [],
      isPinned: dto.isPinned ?? false
    };
  }

  private toUpdateData(dto: UpdateNoteDto): Prisma.NoteUncheckedUpdateInput {
    return {
      projectId: dto.projectId,
      title: dto.title,
      content: dto.content,
      tags: dto.tags,
      isPinned: dto.isPinned
    };
  }
}

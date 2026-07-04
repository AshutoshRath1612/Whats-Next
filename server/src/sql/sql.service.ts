import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSqlSnippetDto, UpdateSqlSnippetDto } from "./dto";

@Injectable()
export class SqlService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);

    return this.prisma.sqlSnippet.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: query.q ? [{ title: { contains: query.q, mode: "insensitive" } }, { query: { contains: query.q, mode: "insensitive" } }] : undefined
      },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "title" ? [{ title: query.sortDir }] : [{ isFavorite: "desc" }, { updatedAt: "desc" }]
    });
  }

  async create(userId: string, dto: CreateSqlSnippetDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    return this.prisma.sqlSnippet.create({ data: this.toCreateData(dto) });
  }

  async update(userId: string, id: string, dto: UpdateSqlSnippetDto) {
    const snippet = await this.findAccessibleSnippet(userId, id);
    return this.prisma.sqlSnippet.update({
      where: { id: snippet.id },
      data: this.toUpdateData(dto)
    });
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }

  private async findAccessibleSnippet(userId: string, id: string) {
    const snippet = await this.prisma.sqlSnippet.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, workspaceId: true }
    });

    if (!snippet) throw new NotFoundException("SQL snippet not found");
    await this.assertWorkspaceAccess(userId, snippet.workspaceId);
    return snippet;
  }

  private toCreateData(dto: CreateSqlSnippetDto): Prisma.SqlSnippetUncheckedCreateInput {
    return {
      workspaceId: dto.workspaceId,
      title: dto.title,
      description: dto.description,
      query: dto.query,
      folder: dto.folder,
      databaseTags: dto.databaseTags ?? [],
      executionNotes: dto.executionNotes,
      isFavorite: dto.isFavorite ?? false
    };
  }

  private toUpdateData(dto: UpdateSqlSnippetDto): Prisma.SqlSnippetUncheckedUpdateInput {
    return {
      title: dto.title,
      description: dto.description,
      query: dto.query,
      folder: dto.folder,
      databaseTags: dto.databaseTags,
      executionNotes: dto.executionNotes,
      isFavorite: dto.isFavorite
    };
  }
}

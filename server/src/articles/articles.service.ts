import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateArticleDto, UpdateArticleDto } from "./dto";

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);

    return this.prisma.knowledgeArticle.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: query.q ? [{ title: { contains: query.q, mode: "insensitive" } }, { problem: { contains: query.q, mode: "insensitive" } }] : undefined
      },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "title" ? { title: query.sortDir } : { updatedAt: "desc" }
    });
  }

  async create(userId: string, dto: CreateArticleDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);

    return this.prisma.knowledgeArticle.create({
      data: {
        workspaceId: dto.workspaceId,
        title: dto.title,
        problem: dto.problem,
        rootCause: dto.rootCause,
        resolution: dto.resolution,
        tags: dto.tags ?? [],
        references: dto.references ?? []
      }
    });
  }

  async update(userId: string, id: string, dto: UpdateArticleDto) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, workspaceId: true }
    });
    if (!article) throw new NotFoundException("Knowledge article not found");
    await this.assertWorkspaceAccess(userId, article.workspaceId);

    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        title: dto.title,
        problem: dto.problem,
        rootCause: dto.rootCause,
        resolution: dto.resolution,
        tags: dto.tags,
        references: dto.references
      }
    });
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }
}

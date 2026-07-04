import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto";

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    return this.prisma.template.findMany({
      where: {
        workspaceId,
        ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { category: { contains: query.q, mode: "insensitive" as const } }] } : {})
      },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "name" ? [{ name: query.sortDir }] : [{ isFavorite: "desc" }, { updatedAt: "desc" }]
    });
  }

  async create(userId: string, dto: CreateTemplateDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    return this.prisma.template.create({
      data: {
        workspaceId: dto.workspaceId,
        name: dto.name,
        category: dto.category,
        body: dto.body,
        variables: dto.variables ?? this.extractVariables(dto.body)
      }
    });
  }

  async update(userId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.findAccessibleTemplate(userId, id);
    return this.prisma.template.update({
      where: { id: template.id },
      data: {
        name: dto.name,
        category: dto.category,
        body: dto.body,
        variables: dto.variables,
        isFavorite: dto.favorite
      }
    });
  }

  private extractVariables(body: string) {
    return Array.from(new Set(Array.from(body.matchAll(/{{\s*([^}]+)\s*}}/g)).map((match) => match[1].trim()).filter(Boolean)));
  }

  private async findAccessibleTemplate(userId: string, id: string) {
    const template = await this.prisma.template.findUnique({ where: { id }, select: { id: true, workspaceId: true } });
    if (!template) throw new NotFoundException("Template not found");
    await this.assertWorkspaceAccess(userId, template.workspaceId);
    return template;
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });
    if (!membership) throw new ForbiddenException("Workspace access denied");
  }
}

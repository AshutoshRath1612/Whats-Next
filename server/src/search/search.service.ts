import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async global(userId: string, workspaceId: string, q: string) {
    if (!workspaceId) throw new BadRequestException("workspaceId is required");
    await this.assertWorkspaceAccess(userId, workspaceId);

    const contains = { contains: q, mode: "insensitive" as const };
    const [tasks, projects, notes, tickets, sqlSnippets, articles, files, templates, events] = await Promise.all([
      this.prisma.task.findMany({ where: { workspaceId, deletedAt: null, title: contains }, take: 8 }),
      this.prisma.project.findMany({ where: { workspaceId, deletedAt: null, name: contains }, take: 8 }),
      this.prisma.note.findMany({ where: { workspaceId, deletedAt: null, title: contains }, take: 8 }),
      this.prisma.ticket.findMany({ where: { workspaceId, deletedAt: null, title: contains }, take: 8 }),
      this.prisma.sqlSnippet.findMany({ where: { workspaceId, deletedAt: null, title: contains }, take: 8 }),
      this.prisma.knowledgeArticle.findMany({ where: { workspaceId, deletedAt: null, title: contains }, take: 8 }),
      this.prisma.fileAsset.findMany({ where: { workspaceId, deletedAt: null, name: contains }, take: 8 }),
      this.prisma.template.findMany({ where: { workspaceId, name: contains }, take: 8 }),
      this.prisma.calendarEvent.findMany({ where: { workspaceId, title: contains }, take: 8 })
    ]);

    return [
      ...tasks.map((item) => ({ type: "task", id: item.id, title: item.title, subtitle: item.status })),
      ...projects.map((item) => ({ type: "project", id: item.id, title: item.name, subtitle: item.status })),
      ...notes.map((item) => ({ type: "note", id: item.id, title: item.title, subtitle: item.format })),
      ...tickets.map((item) => ({ type: "ticket", id: item.id, title: item.title, subtitle: item.ticketNumber })),
      ...sqlSnippets.map((item) => ({ type: "sql", id: item.id, title: item.title, subtitle: item.folder ?? "SQL Library" })),
      ...articles.map((item) => ({ type: "article", id: item.id, title: item.title, subtitle: "Knowledge Base" })),
      ...files.map((item) => ({ type: "file", id: item.id, title: item.name, subtitle: item.entityType ?? item.mimeType })),
      ...templates.map((item) => ({ type: "template", id: item.id, title: item.name, subtitle: item.category })),
      ...events.map((item) => ({ type: "calendar", id: item.id, title: item.title, subtitle: item.startsAt.toISOString() }))
    ];
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }
}

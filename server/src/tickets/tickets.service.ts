import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTicketDto } from "./dto";

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    return this.prisma.ticket.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: query.q ? [{ title: { contains: query.q, mode: "insensitive" } }, { ticketNumber: { contains: query.q, mode: "insensitive" } }, { customer: { contains: query.q, mode: "insensitive" } }] : undefined
      },
      include: { project: { select: { id: true, name: true, color: true } } },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "updatedAt" ? [{ updatedAt: query.sortDir }] : [{ severity: "desc" }, { updatedAt: "desc" }]
    });
  }

  async create(userId: string, dto: CreateTicketDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    return this.prisma.ticket.create({ data: dto });
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }
}

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCalendarEventDto, UpdateCalendarEventDto } from "./dto";

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    return this.prisma.calendarEvent.findMany({
      where: {
        workspaceId,
        ...(query.q ? { title: { contains: query.q, mode: "insensitive" as const } } : {})
      },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "updatedAt" ? { updatedAt: query.sortDir } : { startsAt: "asc" }
    });
  }

  async create(userId: string, dto: CreateCalendarEventDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    return this.prisma.calendarEvent.create({ data: this.toCreateData(dto) });
  }

  async update(userId: string, id: string, dto: UpdateCalendarEventDto) {
    const event = await this.findAccessibleEvent(userId, id);
    return this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: this.toUpdateData(dto)
    });
  }

  async delete(userId: string, id: string) {
    const event = await this.findAccessibleEvent(userId, id);
    return this.prisma.calendarEvent.delete({ where: { id: event.id } });
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }

  private async findAccessibleEvent(userId: string, id: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id },
      select: { id: true, workspaceId: true }
    });

    if (!event) throw new NotFoundException("Calendar event not found");
    await this.assertWorkspaceAccess(userId, event.workspaceId);
    return event;
  }

  private toCreateData(dto: CreateCalendarEventDto): Prisma.CalendarEventUncheckedCreateInput {
    return {
      workspaceId: dto.workspaceId,
      title: dto.title,
      description: dto.description ?? dto.type,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      reminders: []
    };
  }

  private toUpdateData(dto: UpdateCalendarEventDto): Prisma.CalendarEventUncheckedUpdateInput {
    return {
      title: dto.title,
      description: dto.description ?? dto.type,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      reminders: dto.reminders as Prisma.InputJsonValue | undefined
    };
  }
}

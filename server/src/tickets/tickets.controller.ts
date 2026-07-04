import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListQuery, parseListQuery } from "../common/list-query";
import { CreateTicketDto } from "./dto";
import { TicketsService } from "./tickets.service";

@UseGuards(JwtAuthGuard)
@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query() query: ListQuery) {
    return this.tickets.list(user.sub, workspaceId, parseListQuery(query));
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user.sub, dto);
  }
}

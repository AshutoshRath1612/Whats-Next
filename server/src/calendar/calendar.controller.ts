import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListQuery, parseListQuery } from "../common/list-query";
import { CalendarService } from "./calendar.service";
import { CreateCalendarEventDto, UpdateCalendarEventDto } from "./dto";

@UseGuards(JwtAuthGuard)
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query() query: ListQuery) {
    return this.calendar.list(user.sub, workspaceId, parseListQuery(query));
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateCalendarEventDto) {
    return this.calendar.create(user.sub, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.calendar.update(user.sub, id, dto);
  }

  @Delete(":id")
  delete(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.calendar.delete(user.sub, id);
  }
}

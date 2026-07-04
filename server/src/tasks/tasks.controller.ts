import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListQuery, parseListQuery } from "../common/list-query";
import { CreateTaskDto, UpdateTaskDto } from "./dto";
import { TasksService } from "./tasks.service";

@UseGuards(JwtAuthGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query() query: ListQuery) {
    return this.tasks.list(user.sub, workspaceId, parseListQuery(query));
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.sub, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user.sub, id, dto);
  }

  @Patch(":id/status")
  updateStatus(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body("status") status: string) {
    return this.tasks.updateStatus(user.sub, id, status);
  }
}

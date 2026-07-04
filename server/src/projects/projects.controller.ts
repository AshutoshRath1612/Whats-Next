import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListQuery, parseListQuery } from "../common/list-query";
import { CreateProjectDto, UpdateProjectDto } from "./dto";
import { ProjectsService } from "./projects.service";

@UseGuards(JwtAuthGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query("includeArchived") includeArchived: string | undefined, @Query() query: ListQuery) {
    return this.projects.list(user.sub, workspaceId, parseListQuery(query), includeArchived === "true");
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.sub, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user.sub, id, dto);
  }

  @Patch(":id/unarchive")
  unarchive(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.projects.unarchive(user.sub, id);
  }

  @Delete(":id")
  archive(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.projects.archive(user.sub, id);
  }
}

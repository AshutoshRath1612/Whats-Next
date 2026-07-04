import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateWorkspaceDto, UpdateWorkspaceDto } from "./dto";
import { WorkspacesService } from "./workspaces.service";

@UseGuards(JwtAuthGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser) {
    return this.workspaces.listForUser(user.sub);
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.sub, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.update(user.sub, id, dto);
  }

  @Delete(":id")
  archive(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.workspaces.archive(user.sub, id);
  }
}

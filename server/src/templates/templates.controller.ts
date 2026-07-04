import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListQuery, parseListQuery } from "../common/list-query";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto";
import { TemplatesService } from "./templates.service";

@UseGuards(JwtAuthGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query() query: ListQuery) {
    return this.templates.list(user.sub, workspaceId, parseListQuery(query));
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user.sub, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(user.sub, id, dto);
  }
}

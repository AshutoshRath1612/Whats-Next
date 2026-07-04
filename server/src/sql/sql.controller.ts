import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListQuery, parseListQuery } from "../common/list-query";
import { CreateSqlSnippetDto, UpdateSqlSnippetDto } from "./dto";
import { SqlService } from "./sql.service";

@UseGuards(JwtAuthGuard)
@Controller("sql")
export class SqlController {
  constructor(private readonly sql: SqlService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query() query: ListQuery) {
    return this.sql.list(user.sub, workspaceId, parseListQuery(query));
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateSqlSnippetDto) {
    return this.sql.create(user.sub, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateSqlSnippetDto) {
    return this.sql.update(user.sub, id, dto);
  }
}

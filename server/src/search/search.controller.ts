import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SearchService } from "./search.service";

@UseGuards(JwtAuthGuard)
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  global(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query("q") q = "") {
    return this.search.global(user.sub, workspaceId, q);
  }
}

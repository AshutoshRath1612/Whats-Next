import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ManualTimeEntryDto, StartTimeEntryDto } from "./dto";
import { TimeService } from "./time.service";

@UseGuards(JwtAuthGuard)
@Controller("time")
export class TimeController {
  constructor(private readonly time: TimeService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string) {
    return this.time.list(user.sub, workspaceId);
  }

  @Post("start")
  start(@CurrentUser() user: CurrentUser, @Body() dto: StartTimeEntryDto) {
    return this.time.start(user.sub, dto);
  }

  @Post("manual")
  manual(@CurrentUser() user: CurrentUser, @Body() dto: ManualTimeEntryDto) {
    return this.time.manual(user.sub, dto);
  }

  @Patch(":id/toggle")
  toggle(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.time.toggle(user.sub, id);
  }

  @Patch(":id/stop")
  stop(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.time.stop(user.sub, id);
  }
}

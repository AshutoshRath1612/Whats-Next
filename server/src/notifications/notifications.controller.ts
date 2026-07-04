import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { NotificationWorkspaceDto } from "./dto";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string) {
    return this.notifications.list(user.sub, workspaceId);
  }

  @Post("daily-summary")
  sendDailySummary(@CurrentUser() user: CurrentUser, @Body() dto: NotificationWorkspaceDto) {
    return this.notifications.sendDailySummary(user.sub, dto.workspaceId);
  }

  @Post("deadline-reminders")
  sendDeadlineReminders(@CurrentUser() user: CurrentUser, @Body() dto: NotificationWorkspaceDto) {
    return this.notifications.sendDeadlineReminders(user.sub, dto.workspaceId);
  }
}

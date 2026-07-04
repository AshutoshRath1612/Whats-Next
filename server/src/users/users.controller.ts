import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ChangePasswordDto, UpdateProfileDto } from "./dto";
import { UsersService } from "./users.service";

@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  me(@CurrentUser() user: CurrentUser) {
    return this.users.me(user.sub);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: CurrentUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Post("me/change-password")
  changePassword(@CurrentUser() user: CurrentUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.sub, dto);
  }

  @Get("me/sessions")
  sessions(@CurrentUser() user: CurrentUser) {
    return this.users.sessions(user.sub);
  }

  @Post("me/logout-all")
  logoutAll(@CurrentUser() user: CurrentUser) {
    return this.users.logoutAll(user.sub);
  }
}

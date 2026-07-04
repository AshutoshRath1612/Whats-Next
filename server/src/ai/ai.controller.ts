import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AiService } from "./ai.service";
import { AskWorkspaceAiDto } from "./dto";

@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("suggest")
  suggest(@CurrentUser() user: CurrentUser, @Body("prompt") prompt: string) {
    return this.ai.suggest(user.sub, prompt);
  }

  @Post("ask")
  askWorkspace(@CurrentUser() user: CurrentUser, @Body() dto: AskWorkspaceAiDto) {
    return this.ai.askWorkspace(user.sub, dto.workspaceId, dto.question);
  }
}

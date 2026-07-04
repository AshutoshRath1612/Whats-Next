import { IsString } from "class-validator";

export class NotificationWorkspaceDto {
  @IsString()
  workspaceId!: string;
}

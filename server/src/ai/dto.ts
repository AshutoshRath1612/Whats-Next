import { IsString, IsUUID, MinLength } from "class-validator";

export class AskWorkspaceAiDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(3)
  question!: string;
}

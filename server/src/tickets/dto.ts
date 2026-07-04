import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateTicketDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @MinLength(2)
  ticketNumber!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @IsOptional()
  customer?: string;

  @IsIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
  @IsOptional()
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateCalendarEventDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsIn(["Meeting", "Focus", "Reminder"])
  type!: string;
}

export class UpdateCalendarEventDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;

  @IsIn(["Meeting", "Focus", "Reminder"])
  @IsOptional()
  type?: string;

  @IsOptional()
  reminders?: unknown;
}

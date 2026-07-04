import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class StartTimeEntryDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsUUID()
  @IsOptional()
  taskId?: string;
}

export class ManualTimeEntryDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsInt()
  @Min(0)
  minutes!: number;

  @IsUUID()
  @IsOptional()
  taskId?: string;
}

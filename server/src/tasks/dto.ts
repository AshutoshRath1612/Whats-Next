import { IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class CreateTaskDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(["LOW", "MEDIUM", "HIGH", "URGENT"])
  @IsOptional()
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";

  @IsIn(["BACKLOG", "TODO", "IN_PROGRESS", "PENDING", "REVIEW", "DONE", "CANCELED"])
  @IsOptional()
  status?: "BACKLOG" | "TODO" | "IN_PROGRESS" | "PENDING" | "REVIEW" | "DONE" | "CANCELED";

  @IsIn(["Daily", "Weekly", "Monthly"])
  @IsOptional()
  recurringRule?: "Daily" | "Weekly" | "Monthly";

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  labels?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsOptional()
  checklist?: unknown[];

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  timeEstimate?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  actualTime?: number;

  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;
}

export class UpdateTaskDto {
  @IsUUID()
  @IsOptional()
  projectId?: string | null;

  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(["LOW", "MEDIUM", "HIGH", "URGENT"])
  @IsOptional()
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";

  @IsIn(["BACKLOG", "TODO", "IN_PROGRESS", "PENDING", "REVIEW", "DONE", "CANCELED"])
  @IsOptional()
  status?: "BACKLOG" | "TODO" | "IN_PROGRESS" | "PENDING" | "REVIEW" | "DONE" | "CANCELED";

  @IsIn(["Daily", "Weekly", "Monthly"])
  @IsOptional()
  recurringRule?: "Daily" | "Weekly" | "Monthly" | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  labels?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsOptional()
  checklist?: unknown[];

  @IsDateString()
  @IsOptional()
  dueDate?: string | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  timeEstimate?: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  actualTime?: number;

  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;
}

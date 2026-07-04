import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateNoteDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  content!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;
}

export class UpdateNoteDto {
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;
}

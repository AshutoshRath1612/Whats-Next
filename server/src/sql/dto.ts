import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateSqlSnippetDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  query!: string;

  @IsString()
  @IsOptional()
  folder?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  databaseTags?: string[];

  @IsString()
  @IsOptional()
  executionNotes?: string;

  @IsBoolean()
  @IsOptional()
  isFavorite?: boolean;
}

export class UpdateSqlSnippetDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  query?: string;

  @IsString()
  @IsOptional()
  folder?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  databaseTags?: string[];

  @IsString()
  @IsOptional()
  executionNotes?: string;

  @IsBoolean()
  @IsOptional()
  isFavorite?: boolean;
}

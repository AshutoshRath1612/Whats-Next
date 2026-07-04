import { IsArray, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateArticleDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  problem!: string;

  @IsString()
  @IsOptional()
  rootCause?: string;

  @IsString()
  resolution!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  references?: string[];
}

export class UpdateArticleDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  problem?: string;

  @IsString()
  @IsOptional()
  rootCause?: string;

  @IsString()
  @IsOptional()
  resolution?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  references?: string[];
}

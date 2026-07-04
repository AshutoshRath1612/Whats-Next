import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateTemplateDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  category!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}

export class UpdateTemplateDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(2)
  @IsOptional()
  category?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  body?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  favorite?: boolean;
}

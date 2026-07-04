import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class CreateFileAssetDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsInt()
  @Min(0)
  size!: number;

  @IsIn(["Task", "Project", "Note", "Backup", "None"])
  entityType!: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsString()
  @IsOptional()
  url?: string;
}

export class UpdateFileAssetDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsIn(["Task", "Project", "Note", "Backup", "None"])
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  entityId?: string;
}

export class UploadFileBytesDto extends CreateFileAssetDto {
  @IsString()
  @MinLength(1)
  dataBase64!: string;
}

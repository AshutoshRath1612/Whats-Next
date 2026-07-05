import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ListQuery, parseListQuery } from "../common/list-query";
import { CreateFileAssetDto, UpdateFileAssetDto, UploadFileBytesDto } from "./dto";
import { FilesService } from "./files.service";

@UseGuards(JwtAuthGuard)
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get("storage-usage")
  storageUsage(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string) {
    return this.files.storageUsage(user.sub, workspaceId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUser, @Query("workspaceId") workspaceId: string, @Query() query: ListQuery) {
    return this.files.list(user.sub, workspaceId, parseListQuery(query));
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: CreateFileAssetDto) {
    return this.files.create(user.sub, dto);
  }

  @Post("upload")
  upload(@CurrentUser() user: CurrentUser, @Body() dto: UploadFileBytesDto) {
    return this.files.upload(user.sub, dto);
  }

  @Post(":id/restore")
  restoreBackup(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.files.restoreBackup(user.sub, id);
  }

  @Get(":id/content")
  async content(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Res() response: Response) {
    const file = await this.files.content(user.sub, id);
    response.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    response.setHeader("Content-Length", String(file.bytes.length));
    response.setHeader("Cache-Control", "private, max-age=300");
    response.setHeader("Content-Disposition", `inline; filename="${encodeHeaderValue(file.name)}"`);
    response.send(file.bytes);
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateFileAssetDto) {
    return this.files.update(user.sub, id, dto);
  }

  @Delete(":id")
  delete(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.files.delete(user.sub, id);
  }
}

function encodeHeaderValue(value: string) {
  return value.replace(/["\\\r\n]/g, "_");
}

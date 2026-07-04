import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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

  @Patch(":id")
  update(@CurrentUser() user: CurrentUser, @Param("id") id: string, @Body() dto: UpdateFileAssetDto) {
    return this.files.update(user.sub, id, dto);
  }

  @Delete(":id")
  delete(@CurrentUser() user: CurrentUser, @Param("id") id: string) {
    return this.files.delete(user.sub, id);
  }
}

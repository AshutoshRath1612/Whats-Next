import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, Priority, Severity, TaskStatus, TicketStatus, TimerStatus } from "@prisma/client";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { writeAuditLog } from "../common/audit";
import { StructuredLoggerService } from "../common/logging/structured-logger.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFileAssetDto, UpdateFileAssetDto, UploadFileBytesDto } from "./dto";

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly structuredLogger?: StructuredLoggerService
  ) {}

  async list(userId: string, workspaceId: string, query: { q?: string; skip: number; take: number; sortBy?: string; sortDir: "asc" | "desc" }) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    return this.prisma.fileAsset.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {})
      },
      skip: query.skip,
      take: query.take,
      orderBy: query.sortBy === "name" ? { name: query.sortDir } : { createdAt: "desc" }
    });
  }

  async storageUsage(userId: string, workspaceId: string) {
    await this.assertWorkspaceAccess(userId, workspaceId);
    const [aggregate, fileCount] = await Promise.all([
      this.prisma.fileAsset.aggregate({
        where: { workspaceId, deletedAt: null },
        _sum: { size: true }
      }),
      this.prisma.fileAsset.count({ where: { workspaceId, deletedAt: null } })
    ]);
    const databaseBytes = aggregate._sum.size ?? 0;
    let storageError: string | null = null;
    const r2Usage = await this.listR2StorageUsage(workspaceId).catch((error) => {
      storageError = error instanceof Error ? error.message : "Unknown storage scan error";
      this.logger.warn(`Storage usage bucket scan failed for workspace ${workspaceId}: ${storageError}`);
      return null;
    });
    if (!r2Usage && !storageError) storageError = "Workspace storage is not configured.";

    return {
      usedBytes: Math.max(databaseBytes, r2Usage?.usedBytes ?? 0),
      fileCount: Math.max(fileCount, r2Usage?.fileCount ?? 0),
      databaseBytes,
      storageBytes: r2Usage?.usedBytes ?? null,
      storageConnected: r2Usage !== null,
      storageError
    };
  }

  async create(userId: string, dto: CreateFileAssetDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    const entity = this.normalizeEntity(dto.entityType, dto.entityId, userId);
    if (!dto.url) throw new BadRequestException("File assets require a storage object URL. Upload file bytes through the file upload endpoint.");

    const created = await this.prisma.fileAsset.create({
      data: {
        workspaceId: dto.workspaceId,
        name: dto.name,
        mimeType: dto.mimeType,
        size: dto.size,
        url: dto.url,
        entityType: entity.entityType,
        entityId: entity.entityId,
        taskId: entity.entityType === "Task" ? entity.entityId : undefined
      }
    });
    await writeAuditLog(this.prisma, { workspaceId: dto.workspaceId, userId, action: "create", entityType: "file", entityId: created.id, after: created });
    this.structuredLogger?.fileUploaded({
      userId,
      workspaceId: dto.workspaceId,
      data: {
        fileId: created.id,
        fileName: created.name,
        mimeType: created.mimeType,
        sizeBytes: created.size,
        entityType: created.entityType,
        entityId: created.entityId
      }
    });
    return created;
  }

  async upload(userId: string, dto: UploadFileBytesDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    const entity = this.normalizeEntity(dto.entityType, dto.entityId, userId);
    const key = this.buildStorageKey({
      workspaceId: dto.workspaceId,
      name: dto.name,
      entityType: entity.entityType,
      entityId: entity.entityId
    });
    const maxUploadBytes = parseByteSize(this.config.get<string>("FILE_UPLOAD_MAX_BYTES"), 50 * 1024 * 1024);
    if (dto.size > maxUploadBytes) {
      throw new BadRequestException(`File exceeds the ${formatBytes(maxUploadBytes)} upload limit. Increase FILE_UPLOAD_MAX_BYTES and REQUEST_BODY_LIMIT if larger files are required.`);
    }
    const bytes = Buffer.from(dto.dataBase64, "base64");
    if (bytes.length === 0) throw new BadRequestException("File data is empty");
    if (bytes.length > maxUploadBytes) {
      throw new BadRequestException(`File exceeds the ${formatBytes(maxUploadBytes)} upload limit. Increase FILE_UPLOAD_MAX_BYTES and REQUEST_BODY_LIMIT if larger files are required.`);
    }
    if (dto.size && Math.abs(bytes.length - dto.size) > 2) throw new BadRequestException("File size does not match uploaded data");

    const url = await this.uploadToR2(key, bytes, dto.mimeType);
    const created = await this.prisma.fileAsset.create({
      data: {
        workspaceId: dto.workspaceId,
        name: dto.name,
        mimeType: dto.mimeType,
        size: bytes.length,
        url,
        entityType: entity.entityType,
        entityId: entity.entityId,
        taskId: entity.entityType === "Task" ? entity.entityId : undefined
      }
    });
    await writeAuditLog(this.prisma, { workspaceId: dto.workspaceId, userId, action: "create", entityType: "file", entityId: created.id, after: created });
    this.structuredLogger?.fileUploaded({
      userId,
      workspaceId: dto.workspaceId,
      data: {
        fileId: created.id,
        fileName: created.name,
        mimeType: created.mimeType,
        sizeBytes: created.size,
        entityType: created.entityType,
        entityId: created.entityId
      }
    });
    return created;
  }

  async content(userId: string, id: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, workspaceId: true, name: true, mimeType: true, url: true }
    });
    if (!file) throw new NotFoundException("File not found");
    await this.assertWorkspaceAccess(userId, file.workspaceId);

    const bytes = await this.fetchR2ObjectFromUrl(file.url);
    return { name: file.name, mimeType: file.mimeType, bytes };
  }

  async restoreBackup(userId: string, id: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: { id, deletedAt: null, entityType: "Backup" },
      select: { id: true, workspaceId: true, name: true, mimeType: true, url: true }
    });
    if (!file) throw new NotFoundException("Backup file not found");
    await this.assertWorkspaceAccess(userId, file.workspaceId);
    if (!file.mimeType.includes("json")) throw new BadRequestException("Only JSON workspace backups can be restored");

    const bytes = await this.fetchR2ObjectFromUrl(file.url);
    const snapshot = parseWorkspaceBackup(bytes.toString("utf8"));
    const restoredAt = new Date();

    const summary = await this.prisma.$transaction(async (tx) => {
      await tx.fileAsset.updateMany({
        where: { workspaceId: file.workspaceId, taskId: { not: null } },
        data: { taskId: null }
      });
      await tx.comment.deleteMany({
        where: {
          OR: [
            { task: { workspaceId: file.workspaceId } },
            { ticket: { workspaceId: file.workspaceId } }
          ]
        }
      });
      await tx.taskDependency.deleteMany({
        where: {
          OR: [
            { task: { workspaceId: file.workspaceId } },
            { dependsOn: { workspaceId: file.workspaceId } }
          ]
        }
      });
      await tx.noteLink.deleteMany({
        where: {
          OR: [
            { fromNote: { workspaceId: file.workspaceId } },
            { toNote: { workspaceId: file.workspaceId } }
          ]
        }
      });
      await tx.noteVersion.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.timeEntry.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.calendarEvent.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.template.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.sqlSnippet.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.knowledgeArticle.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.ticket.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.task.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.milestone.deleteMany({ where: { project: { workspaceId: file.workspaceId } } });
      await tx.note.deleteMany({ where: { workspaceId: file.workspaceId } });
      await tx.project.deleteMany({ where: { workspaceId: file.workspaceId } });

      const projects = normalizeArray(snapshot.projects).map((project, index) => toProjectRestoreData(file.workspaceId, project, index));
      if (projects.length) await tx.project.createMany({ data: projects.map(({ milestones: _milestones, ...project }) => project), skipDuplicates: true });
      const projectIds = new Set(projects.map((project) => project.id as string));

      const milestones: Prisma.MilestoneCreateManyInput[] = projects.flatMap((project) => project.milestones.map((milestone) => ({ ...milestone, projectId: project.id as string })));
      if (milestones.length) await tx.milestone.createMany({ data: milestones, skipDuplicates: true });

      const tasks = normalizeArray(snapshot.tasks).map((task, index) => toTaskRestoreData(file.workspaceId, task, index, projectIds));
      if (tasks.length) await tx.task.createMany({ data: tasks, skipDuplicates: true });
      const taskIds = new Set(tasks.map((task) => task.id as string));

      const notes = normalizeArray(snapshot.notes).map((note, index) => toNoteRestoreData(file.workspaceId, note, index, projectIds));
      if (notes.length) await tx.note.createMany({ data: notes.map(({ versions: _versions, ...note }) => note), skipDuplicates: true });
      const noteVersions: Prisma.NoteVersionCreateManyInput[] = notes.flatMap((note) => note.versions.map((version) => ({ ...version, noteId: note.id as string, workspaceId: file.workspaceId })));
      if (noteVersions.length) await tx.noteVersion.createMany({ data: noteVersions, skipDuplicates: true });

      const articles = normalizeArray(snapshot.articles).map((article, index) => toArticleRestoreData(file.workspaceId, article, index));
      if (articles.length) await tx.knowledgeArticle.createMany({ data: articles, skipDuplicates: true });

      const sqlSnippets = normalizeArray(snapshot.sqlSnippets).map((snippet, index) => toSqlRestoreData(file.workspaceId, snippet, index));
      if (sqlSnippets.length) await tx.sqlSnippet.createMany({ data: sqlSnippets, skipDuplicates: true });

      const tickets = normalizeArray(snapshot.tickets).map((ticket, index) => toTicketRestoreData(file.workspaceId, ticket, index, projectIds));
      if (tickets.length) await tx.ticket.createMany({ data: uniqueBy(tickets, (ticket) => ticket.ticketNumber), skipDuplicates: true });

      const events = normalizeArray(snapshot.events).map((event, index) => toCalendarRestoreData(file.workspaceId, event, index, projectIds, taskIds));
      if (events.length) await tx.calendarEvent.createMany({ data: events, skipDuplicates: true });

      const templates = normalizeArray(snapshot.templates).map((template, index) => toTemplateRestoreData(file.workspaceId, template, index));
      if (templates.length) await tx.template.createMany({ data: templates, skipDuplicates: true });

      const timeEntries = normalizeArray(snapshot.timeEntries).map((entry, index) => toTimeRestoreData(file.workspaceId, userId, entry, index, taskIds));
      if (timeEntries.length) await tx.timeEntry.createMany({ data: timeEntries, skipDuplicates: true });

      await relinkFileAssets(tx, file.workspaceId, normalizeArray(snapshot.files), taskIds);

      return {
        projects: projects.length,
        tasks: tasks.length,
        notes: notes.length,
        articles: articles.length,
        sqlSnippets: sqlSnippets.length,
        tickets: tickets.length,
        events: events.length,
        templates: templates.length,
        timeEntries: timeEntries.length
      };
    });

    await writeAuditLog(this.prisma, {
      workspaceId: file.workspaceId,
      userId,
      action: "restore",
      entityType: "backup",
      entityId: file.id,
      after: { fileName: file.name, restoredAt: restoredAt.toISOString(), summary }
    });

    return { restored: true, backupId: file.id, fileName: file.name, restoredAt: restoredAt.toISOString(), summary };
  }

  async update(userId: string, id: string, dto: UpdateFileAssetDto) {
    const file = await this.findAccessibleFile(userId, id);
    const entity = this.normalizeEntity(dto.entityType ?? file.entityType ?? "None", dto.entityId ?? file.entityId ?? undefined, userId);

    const updated = await this.prisma.fileAsset.update({
      where: { id: file.id },
      data: {
        name: dto.name,
        entityType: entity.entityType,
        entityId: entity.entityId,
        taskId: entity.entityType === "Task" ? entity.entityId : null
      }
    });
    await writeAuditLog(this.prisma, { workspaceId: file.workspaceId, userId, action: "update", entityType: "file", entityId: updated.id, after: updated });
    return updated;
  }

  async delete(userId: string, id: string) {
    const file = await this.findAccessibleFile(userId, id);
    const deleted = await this.prisma.fileAsset.update({
      where: { id: file.id },
      data: { deletedAt: new Date() }
    });
    await writeAuditLog(this.prisma, { workspaceId: file.workspaceId, userId, action: "delete", entityType: "file", entityId: deleted.id });
    this.structuredLogger?.fileDeleted({
      userId,
      workspaceId: file.workspaceId,
      data: {
        fileId: deleted.id,
        fileName: deleted.name,
        entityType: deleted.entityType,
        entityId: deleted.entityId
      }
    });
    return deleted;
  }

  private buildStorageKey(input: { workspaceId: string; name: string; entityType?: string | null; entityId?: string | null }) {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const uploadId = randomUUID();
    const safeName = sanitizeStorageFileName(input.name);

    if (input.entityType === "Backup") {
      return `workspaces/${input.workspaceId}/backups/${year}/${month}/${day}/${uploadId}/${safeName}`;
    }

    if (input.entityType === "ProfileAvatar") {
      const userSegment = sanitizeStorageSegment(input.entityId ?? "user");
      return `workspaces/${input.workspaceId}/profiles/${userSegment}/avatars/${year}/${month}/${day}/${uploadId}/${safeName}`;
    }

    if (!input.entityType || input.entityType === "None") {
      return `workspaces/${input.workspaceId}/files/${year}/${month}/${day}/workspace/${uploadId}/${safeName}`;
    }

    const entityType = sanitizeStorageSegment(input.entityType).toLowerCase();
    const entityId = input.entityId ? sanitizeStorageSegment(input.entityId) : "unassigned";
    return `workspaces/${input.workspaceId}/files/${year}/${month}/${day}/${entityType}/${entityId}/${uploadId}/${safeName}`;
  }

  private buildPublicUrl(key: string) {
    const accountId = this.config.get<string>("CLOUDFLARE_R2_ACCOUNT_ID");
    const bucket = this.config.get<string>("CLOUDFLARE_R2_BUCKET");
    if (!accountId || !bucket) throw new BadRequestException("Workspace storage is not configured");
    return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeRfc3986).join("/")}`;
  }

  private async uploadToR2(key: string, bytes: Buffer, mimeType: string) {
    const accountId = this.config.get<string>("CLOUDFLARE_R2_ACCOUNT_ID");
    const accessKeyId = this.config.get<string>("CLOUDFLARE_R2_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
    const bucket = this.config.get<string>("CLOUDFLARE_R2_BUCKET");
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new BadRequestException("Workspace storage is not configured");
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${bucket}/${key.split("/").map(encodeRfc3986).join("/")}`;
    const payloadHash = createHash("sha256").update(bytes).digest("hex");
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalHeaders = [
      `content-type:${mimeType}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`
    ].join("\n") + "\n";
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(`https://${host}${canonicalUri}`, {
      method: "PUT",
      body: bytes as unknown as BodyInit,
      headers: {
        Authorization: authorization,
        "Content-Type": mimeType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate
      }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new BadRequestException(`Workspace storage upload failed${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }

    return this.buildPublicUrl(key);
  }

  private async fetchR2ObjectFromUrl(url: string) {
    const objectKey = this.parseR2ObjectKey(url);
    if (!objectKey) throw new BadRequestException("File content is not available from configured workspace storage.");

    const accountId = this.config.get<string>("CLOUDFLARE_R2_ACCOUNT_ID");
    const accessKeyId = this.config.get<string>("CLOUDFLARE_R2_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
    const bucket = this.config.get<string>("CLOUDFLARE_R2_BUCKET");
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new BadRequestException("Workspace storage is not configured");
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${bucket}/${objectKey.split("/").map(encodeRfc3986).join("/")}`;
    const payloadHash = createHash("sha256").update("").digest("hex");
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalHeaders = [
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`
    ].join("\n") + "\n";
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["GET", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(`https://${host}${canonicalUri}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate
      }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new BadRequestException(`Workspace storage download failed${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private parseR2ObjectKey(url: string) {
    const accountId = this.config.get<string>("CLOUDFLARE_R2_ACCOUNT_ID");
    const bucket = this.config.get<string>("CLOUDFLARE_R2_BUCKET");
    if (!accountId || !bucket) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    if (parsed.hostname !== `${accountId}.r2.cloudflarestorage.com`) return null;
    const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    if (segments[0] !== bucket || segments.length < 2) return null;
    return segments.slice(1).join("/");
  }

  private async listR2StorageUsage(workspaceId: string) {
    const accountId = this.config.get<string>("CLOUDFLARE_R2_ACCOUNT_ID");
    const accessKeyId = this.config.get<string>("CLOUDFLARE_R2_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
    const bucket = this.config.get<string>("CLOUDFLARE_R2_BUCKET");
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

    let usedBytes = 0;
    let fileCount = 0;
    const prefixes = [`workspaces/${workspaceId}/`, `${workspaceId}/`];

    for (const prefix of prefixes) {
      let continuationToken: string | undefined;
      let pageCount = 0;

      do {
        const xml = await this.fetchR2ObjectList({
          accountId,
          accessKeyId,
          secretAccessKey,
          bucket,
          prefix,
          continuationToken
        });
        usedBytes += extractObjectSizes(xml).reduce((total, size) => total + size, 0);
        fileCount += countXmlTag(xml, "Key");
        continuationToken = extractXmlText(xml, "NextContinuationToken");
        pageCount += 1;
      } while (continuationToken && pageCount < 100);
    }

    return { usedBytes, fileCount };
  }

  private async fetchR2ObjectList(input: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; prefix: string; continuationToken?: string }) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const host = `${input.accountId}.r2.cloudflarestorage.com`;
    const payloadHash = createHash("sha256").update("").digest("hex");
    const queryParams: Array<[string, string]> = [
      ["list-type", "2"],
      ["prefix", input.prefix]
    ];
    if (input.continuationToken) queryParams.push(["continuation-token", input.continuationToken]);
    const canonicalQuery = queryParams
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
      .join("&");
    const canonicalUri = `/${input.bucket}`;
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalHeaders = [
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`
    ].join("\n") + "\n";
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["GET", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(`https://${host}${canonicalUri}?${canonicalQuery}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate
      }
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`R2 list failed with ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    return body;
  }

  private normalizeEntity(entityType: string, entityId?: string, userId?: string) {
    if (entityType === "ProfileAvatar") return { entityType: "ProfileAvatar", entityId: userId ?? entityId ?? null };
    if (entityType === "None") return { entityType: null, entityId: null };
    return { entityType, entityId: entityId || null };
  }

  private async findAccessibleFile(userId: string, id: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, workspaceId: true, entityType: true, entityId: true }
    });
    if (!file) throw new NotFoundException("File not found");
    await this.assertWorkspaceAccess(userId, file.workspaceId);
    return file;
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sanitizeStorageFileName(value: string) {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
  return sanitized || "file";
}

function sanitizeStorageSegment(value: string) {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return sanitized || "unknown";
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function extractObjectSizes(xml: string) {
  return Array.from(xml.matchAll(/<Size>(\d+)<\/Size>/g))
    .map((match) => Number(match[1]))
    .filter((size) => Number.isFinite(size));
}

function countXmlTag(xml: string, tagName: string) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}>`, "g"))).length;
}

function extractXmlText(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}>([^<]+)<\\/${tagName}>`));
  return match?.[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
}

type BackupObject = Record<string, unknown>;

type ProjectRestoreData = Prisma.ProjectCreateManyInput & {
  milestones: Prisma.MilestoneCreateManyInput[];
};

type NoteRestoreData = Prisma.NoteCreateManyInput & {
  versions: Omit<Prisma.NoteVersionCreateManyInput, "workspaceId" | "noteId">[];
};

function parseWorkspaceBackup(text: string): BackupObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BadRequestException("Backup file is not valid JSON");
  }

  const candidate = isRecord(parsed) && isRecord(parsed.state) ? parsed.state : parsed;
  if (!isRecord(candidate)) throw new BadRequestException("Backup does not contain a workspace state object");
  return candidate;
}

function normalizeArray(value: unknown): BackupObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function toProjectRestoreData(workspaceId: string, project: BackupObject, index: number): ProjectRestoreData {
  const id = stringValue(project.id) || randomUUID();
  return {
    id,
    workspaceId,
    name: stringValue(project.name) || `Restored project ${index + 1}`,
    description: stringValue(project.description) || null,
    icon: stringValue(project.icon) || "folder-kanban",
    coverUrl: stringValue(project.coverUrl) || null,
    color: stringValue(project.color) || "#4F46E5",
    status: booleanValue(project.archived) ? "archived" : "active",
    dueDate: dateOnlyValue(project.due),
    progress: numberValue(project.progress, 0),
    isPinned: booleanValue(project.pinned),
    milestones: normalizeArray(project.milestones).map((milestone, milestoneIndex) => ({
      id: stringValue(milestone.id) || randomUUID(),
      projectId: id,
      title: stringValue(milestone.title) || `Milestone ${milestoneIndex + 1}`,
      dueDate: dateOnlyValue(milestone.due),
      completed: booleanValue(milestone.completed)
    }))
  };
}

function toTaskRestoreData(workspaceId: string, task: BackupObject, index: number, projectIds: Set<string>): Prisma.TaskCreateManyInput {
  const status = taskStatusValue(task.status);
  const subtasks = normalizeArray(task.subtasks);
  return {
    id: stringValue(task.id) || randomUUID(),
    workspaceId,
    projectId: linkedIdValue(task.projectId, projectIds),
    title: stringValue(task.title) || `Restored task ${index + 1}`,
    description: stringValue(task.description) || null,
    status,
    priority: priorityValue(task.priority),
    labels: stringArray(task.tags),
    tags: stringArray(task.tags),
    checklist: jsonArray(task.checklist),
    dueDate: dateOnlyValue(task.due),
    recurringRule: recurrenceValue(task.recurringRule),
    timeEstimate: numberValue(task.estimateMinutes, 60),
    actualTime: numberValue(task.actualMinutes, 0),
    customFields: jsonObject({
      workType: stringValue(task.workType) === "Ticket" ? "Ticket" : "Task",
      ticketNumber: stringValue(task.ticketNumber),
      customer: stringValue(task.customer),
      severity: severityLabelValue(task.severity),
      investigation: stringValue(task.investigation),
      resolution: stringValue(task.resolution),
      closureNotes: stringValue(task.closureNotes),
      overdueReason: stringValue(task.overdueReason),
      startDate: stringValue(task.startDate),
      progress: status === TaskStatus.DONE ? 100 : numberValue(task.progress, 0),
      acceptanceCriteria: stringValue(task.acceptanceCriteria),
      subtasks,
      dependencies: stringArray(task.dependencies),
      attachments: stringArray(task.attachments),
      notes: normalizeArray(task.notes)
    })
  };
}

function toNoteRestoreData(workspaceId: string, note: BackupObject, index: number, projectIds: Set<string>): NoteRestoreData {
  const id = stringValue(note.id) || randomUUID();
  return {
    id,
    workspaceId,
    projectId: linkedIdValue(note.projectId, projectIds),
    title: stringValue(note.title) || `Restored note ${index + 1}`,
    content: stringValue(note.content),
    tags: stringArray(note.tags),
    isPinned: booleanValue(note.pinned),
    versions: normalizeArray(note.versions).map((version) => ({
      id: stringValue(version.id) || randomUUID(),
      projectId: linkedIdValue(version.projectId, projectIds),
      title: stringValue(version.title) || stringValue(note.title) || `Restored note ${index + 1}`,
      content: stringValue(version.content),
      tags: stringArray(version.tags),
      isPinned: booleanValue(version.pinned),
      savedAt: dateTimeValue(version.savedAt) ?? new Date()
    }))
  };
}

function toArticleRestoreData(workspaceId: string, article: BackupObject, index: number): Prisma.KnowledgeArticleCreateManyInput {
  return {
    id: stringValue(article.id) || randomUUID(),
    workspaceId,
    title: stringValue(article.title) || `Restored article ${index + 1}`,
    problem: stringValue(article.problem) || stringValue(article.title) || "Restored knowledge item",
    rootCause: stringValue(article.rootCause) || null,
    resolution: stringValue(article.resolution) || "Restored from backup",
    references: stringArray(article.references),
    tags: stringArray(article.tags)
  };
}

function toSqlRestoreData(workspaceId: string, snippet: BackupObject, index: number): Prisma.SqlSnippetCreateManyInput {
  return {
    id: stringValue(snippet.id) || randomUUID(),
    workspaceId,
    title: stringValue(snippet.title) || `Restored SQL ${index + 1}`,
    description: stringValue(snippet.description) || null,
    query: stringValue(snippet.query) || "-- Restored empty SQL snippet",
    databaseTags: stringArray(snippet.tags),
    folder: stringValue(snippet.folder) || "General",
    executionNotes: stringValue(snippet.executionNotes) || null,
    isFavorite: booleanValue(snippet.favorite)
  };
}

function toTicketRestoreData(workspaceId: string, ticket: BackupObject, index: number, projectIds: Set<string>): Prisma.TicketCreateManyInput {
  return {
    id: stringValue(ticket.id) || randomUUID(),
    workspaceId,
    projectId: linkedIdValue(ticket.projectId, projectIds),
    ticketNumber: stringValue(ticket.number) || stringValue(ticket.ticketNumber) || `RESTORED-${index + 1}`,
    customer: stringValue(ticket.customer) || null,
    title: stringValue(ticket.title) || `Restored ticket ${index + 1}`,
    priority: priorityValue(ticket.priority),
    severity: severityValue(ticket.severity),
    status: ticketStatusValue(ticket.status),
    investigation: stringValue(ticket.investigation) || null,
    resolution: stringValue(ticket.resolution) || null,
    closureNotes: stringValue(ticket.closureNotes) || null
  };
}

function toCalendarRestoreData(workspaceId: string, event: BackupObject, index: number, projectIds: Set<string>, taskIds: Set<string>): Prisma.CalendarEventCreateManyInput {
  const startsAt = dateTimeFromDateAndTime(event.date, event.start, "09:00");
  const endsAt = dateTimeFromDateAndTime(event.date, event.end, "09:30");
  const type = calendarTypeValue(event.type);
  return {
    id: stringValue(event.id) || randomUUID(),
    workspaceId,
    title: stringValue(event.title) || `Restored event ${index + 1}`,
    description: JSON.stringify({
      type,
      taskId: linkedIdValue(event.taskId, taskIds) ?? undefined,
      projectId: linkedIdValue(event.projectId, projectIds) ?? undefined
    }),
    startsAt,
    endsAt: endsAt.getTime() >= startsAt.getTime() ? endsAt : new Date(startsAt.getTime() + 30 * 60_000),
    reminders: jsonArray([{ enabled: booleanValue(event.reminderEnabled), minutes: numberValue(event.reminderMinutes, 10) }])
  };
}

function toTemplateRestoreData(workspaceId: string, template: BackupObject, index: number): Prisma.TemplateCreateManyInput {
  const body = stringValue(template.body);
  return {
    id: stringValue(template.id) || randomUUID(),
    workspaceId,
    name: stringValue(template.name) || `Restored template ${index + 1}`,
    category: stringValue(template.category) || "General",
    body,
    variables: stringArray(template.variables).length ? stringArray(template.variables) : extractTemplateVariables(body),
    isFavorite: booleanValue(template.favorite)
  };
}

function toTimeRestoreData(workspaceId: string, userId: string, entry: BackupObject, index: number, taskIds: Set<string>): Prisma.TimeEntryCreateManyInput {
  const elapsedSeconds = numberValue(entry.elapsedSeconds, numberValue(entry.durationSec, numberValue(entry.durationMin, 0) * 60));
  const startedAt = dateTimeValue(entry.startedAt) ?? new Date(Date.now() - elapsedSeconds * 1000);
  const status = timerStatusValue(entry.status);
  return {
    id: stringValue(entry.id) || randomUUID(),
    workspaceId,
    userId,
    taskId: linkedIdValue(entry.taskId, taskIds),
    title: stringValue(entry.title) || `Restored time entry ${index + 1}`,
    status,
    startedAt,
    endedAt: status === TimerStatus.STOPPED ? new Date(startedAt.getTime() + elapsedSeconds * 1000) : null,
    durationMin: Math.floor(elapsedSeconds / 60),
    durationSec: elapsedSeconds
  };
}

async function relinkFileAssets(tx: Prisma.TransactionClient, workspaceId: string, files: BackupObject[], taskIds: Set<string>) {
  for (const file of files) {
    const id = stringValue(file.id);
    if (!id || stringValue(file.linkedType) !== "Task") continue;
    const taskId = linkedIdValue(file.linkedId, taskIds);
    if (!taskId) continue;
    await tx.fileAsset.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: { entityType: "Task", entityId: taskId, taskId }
    });
  }
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is BackupObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function booleanValue(value: unknown) {
  return value === true;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function linkedIdValue(value: unknown, allowedIds: Set<string>) {
  const id = stringValue(value);
  return id && allowedIds.has(id) ? id : null;
}

function dateOnlyValue(value: unknown) {
  const text = stringValue(value);
  if (!text || text === "TBD" || text === "Today") return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTimeValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTimeFromDateAndTime(dateValue: unknown, timeValue: unknown, fallbackTime: string) {
  const dateText = stringValue(dateValue) || new Date().toISOString().slice(0, 10);
  const timeText = /^\d{2}:\d{2}$/.test(stringValue(timeValue)) ? stringValue(timeValue) : fallbackTime;
  const date = new Date(`${dateText}T${timeText}:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function priorityValue(value: unknown) {
  const text = stringValue(value).toUpperCase();
  if (text === "LOW" || text === "HIGH" || text === "URGENT") return text as Priority;
  return Priority.MEDIUM;
}

function taskStatusValue(value: unknown) {
  const normalized = stringValue(value).toUpperCase().replace(/\s+/g, "_");
  if (normalized === "BACKLOG" || normalized === "IN_PROGRESS" || normalized === "PENDING" || normalized === "REVIEW" || normalized === "DONE" || normalized === "CANCELED") return normalized as TaskStatus;
  return TaskStatus.TODO;
}

function severityValue(value: unknown) {
  const text = stringValue(value).toUpperCase();
  if (text === "LOW" || text === "HIGH" || text === "CRITICAL") return text as Severity;
  return Severity.MEDIUM;
}

function severityLabelValue(value: unknown) {
  const text = stringValue(value);
  return text === "Low" || text === "High" || text === "Critical" ? text : "Medium";
}

function ticketStatusValue(value: unknown) {
  const normalized = stringValue(value).toUpperCase().replace(/\s+/g, "_");
  if (normalized === "INVESTIGATING" || normalized === "WAITING" || normalized === "RESOLVED" || normalized === "CLOSED") return normalized as TicketStatus;
  return TicketStatus.OPEN;
}

function timerStatusValue(value: unknown) {
  const normalized = stringValue(value).toUpperCase();
  if (normalized === "RUNNING" || normalized === "PAUSED") return normalized as TimerStatus;
  return TimerStatus.STOPPED;
}

function recurrenceValue(value: unknown) {
  const text = stringValue(value);
  return text === "Daily" || text === "Weekly" || text === "Monthly" ? text : null;
}

function calendarTypeValue(value: unknown) {
  const text = stringValue(value);
  return text === "Meeting" || text === "Reminder" ? text : "Focus";
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function jsonArray(value: unknown): Prisma.InputJsonArray {
  return (Array.isArray(value) ? value : []) as Prisma.InputJsonArray;
}

function extractTemplateVariables(body: string) {
  return Array.from(new Set(Array.from(body.matchAll(/{{\s*([^}]+)\s*}}/g)).map((match) => match[1].trim()).filter(Boolean)));
}

function parseByteSize(value: string | undefined, fallbackBytes: number) {
  if (!value) return fallbackBytes;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match) return fallbackBytes;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackBytes;
  const unit = (match[2] ?? "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  return Math.floor(amount * multipliers[unit]);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

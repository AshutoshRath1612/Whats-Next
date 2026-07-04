import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFileAssetDto, UpdateFileAssetDto, UploadFileBytesDto } from "./dto";
import { writeAuditLog } from "../common/audit";

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
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
    const entity = this.normalizeEntity(dto.entityType, dto.entityId);
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
    return created;
  }

  async upload(userId: string, dto: UploadFileBytesDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    const entity = this.normalizeEntity(dto.entityType, dto.entityId);
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
    return created;
  }

  async update(userId: string, id: string, dto: UpdateFileAssetDto) {
    const file = await this.findAccessibleFile(userId, id);
    const entity = this.normalizeEntity(dto.entityType ?? file.entityType ?? "None", dto.entityId ?? file.entityId ?? undefined);

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

    const entityType = sanitizeStorageSegment(input.entityType ?? "unlinked").toLowerCase();
    const entityId = input.entityId ? sanitizeStorageSegment(input.entityId) : "unlinked";
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

  private normalizeEntity(entityType: string, entityId?: string) {
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
  return sanitized || "unlinked";
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

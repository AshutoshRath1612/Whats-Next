import { FileAsset } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const MAX_UPLOAD_BYTES = parseByteSize(process.env.NEXT_PUBLIC_FILE_UPLOAD_MAX_BYTES, 50 * 1024 * 1024);

export type ApiFileAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
};

export type CreateFileAssetInput = Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>;
export type StorageUsage = {
  usedBytes: number;
  fileCount: number;
  databaseBytes?: number;
  storageBytes?: number | null;
  storageConnected?: boolean;
  storageError?: string | null;
};

async function fileRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message ?? "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export function mapApiFileAsset(file: ApiFileAsset): FileAsset {
  return {
    id: file.id,
    name: file.name,
    type: file.mimeType,
    size: file.size,
    url: file.url,
    linkedType: parseLinkedType(file.entityType),
    linkedId: file.entityId ?? undefined,
    uploadedAt: new Date(file.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  };
}

export function listFilesRequest(token: string | null | undefined, workspaceId: string, query = "") {
  const params = new URLSearchParams({ workspaceId });
  if (query) params.set("q", query);
  return fileRequest<ApiFileAsset[]>(`/files?${params.toString()}`, token);
}

export function getStorageUsageRequest(token: string | null | undefined, workspaceId: string) {
  const params = new URLSearchParams({ workspaceId });
  return fileRequest<StorageUsage>(`/files/storage-usage?${params.toString()}`, token);
}

export function createFileAssetRequest(token: string | null | undefined, workspaceId: string, input: CreateFileAssetInput) {
  return fileRequest<ApiFileAsset>("/files", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      name: input.name,
      mimeType: input.type,
      size: input.size,
      url: input.url,
      entityType: input.linkedType,
      entityId: input.linkedId
    })
  });
}

export async function uploadFileRequest(token: string | null | undefined, workspaceId: string, input: CreateFileAssetInput, file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit.`);
  }

  return fileRequest<ApiFileAsset>("/files/upload", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      name: input.name,
      mimeType: input.type || "application/octet-stream",
      size: input.size,
      entityType: input.linkedType,
      entityId: input.linkedId,
      dataBase64: await fileToBase64(file)
    })
  });
}

export function deleteFileAssetRequest(token: string | null | undefined, fileId: string) {
  return fileRequest<ApiFileAsset>(`/files/${fileId}`, token, { method: "DELETE" });
}

export function updateFileAssetRequest(token: string | null | undefined, fileId: string, input: { name?: string; entityType?: string; entityId?: string }) {
  return fileRequest<ApiFileAsset>(`/files/${fileId}`, token, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

function parseLinkedType(value?: string | null): FileAsset["linkedType"] {
  if (value === "Task" || value === "Project" || value === "Note" || value === "Backup") return value;
  return "None";
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",").pop() ?? "" : value);
    };
    reader.readAsDataURL(file);
  });
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

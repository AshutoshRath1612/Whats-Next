import { randomUUID } from "node:crypto";
import { ApiLogRequest } from "./api-log.types";

export function getOrCreateRequestId(request: ApiLogRequest) {
  const existing = request.requestId ?? readHeader(request.headers["x-request-id"]);
  const requestId = existing || randomUUID();
  request.requestId = requestId;
  return requestId;
}

export function extractWorkspaceId(request: ApiLogRequest) {
  return firstString([
    readParam(request.params, "workspaceId"),
    readQuery(request.query, "workspaceId"),
    readBody(request.body, "workspaceId")
  ]);
}

export function getRequestUserId(request: ApiLogRequest) {
  return request.user?.id ?? request.user?.sub;
}

export function getRoutePath(request: ApiLogRequest) {
  return request.route?.path ? `${request.baseUrl}${request.route.path}` : request.originalUrl;
}

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readParam(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : undefined;
}

function readQuery(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : undefined;
}

function readBody(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : undefined;
}

function firstString(values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}

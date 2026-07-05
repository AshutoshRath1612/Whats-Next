import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

const blockedObjectKeys = new Set(["__proto__", "prototype", "constructor"]);
const controlCharactersPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const bidiControlCharactersPattern = /[\u202A-\u202E\u2066-\u2069]/g;
const maxSanitizationDepth = 24;

@Injectable()
export class RequestSanitizationMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    request.body = sanitizeRequestValue(request.body);
    request.query = sanitizeRequestValue(request.query) as Request["query"];
    request.params = sanitizeRequestValue(request.params) as Request["params"];
    next();
  }
}

export function sanitizeRequestValue<T>(value: T, depth = 0): T {
  if (depth > maxSanitizationDepth) return value;
  if (typeof value === "string") return sanitizeRequestString(value) as T;
  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRequestValue(item, depth + 1)) as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
    const safeKey = sanitizeRequestKey(key);
    if (!safeKey || blockedObjectKeys.has(safeKey)) continue;
    output[safeKey] = sanitizeRequestValue(childValue, depth + 1);
  }

  return output as T;
}

function sanitizeRequestKey(value: string) {
  return sanitizeRequestString(value).trim();
}

function sanitizeRequestString(value: string) {
  return value
    .replace(controlCharactersPattern, "")
    .replace(bidiControlCharactersPattern, "");
}

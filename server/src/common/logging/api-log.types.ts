import { Request } from "express";

export type RequestUser = {
  id?: string;
  sub?: string;
  email?: string;
};

export type ApiLogRequest = Request & {
  requestId?: string;
  requestStartedAt?: Date;
  apiLogWritten?: boolean;
  user?: RequestUser;
  route?: {
    path?: string;
  };
};

export type ApiRequestLogInput = {
  requestId: string;
  method: string;
  path: string;
  route?: string;
  controller?: string;
  handler?: string;
  trace?: unknown;
  statusCode?: number;
  success: boolean;
  durationMs: number;
  userId?: string;
  workspaceId?: string;
  ip?: string;
  userAgent?: string;
  query?: unknown;
  params?: unknown;
  body?: unknown;
  response?: unknown;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  startedAt: Date;
  completedAt: Date;
};

export type ApiErrorAlertInput = ApiRequestLogInput & {
  error: unknown;
};

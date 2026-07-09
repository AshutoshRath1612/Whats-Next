import { Request } from "express";

export type RequestUser = {
  id?: string;
  sub?: string;
  email?: string;
};

export type ApiLogRequest = Request & {
  requestId?: string;
  correlationId?: string;
  requestStartedAt?: Date;
  requestStartedHrtimeNs?: bigint;
  apiLogWritten?: boolean;
  user?: RequestUser;
  route?: {
    path?: string;
  };
};

export type ApiRequestLogInput = {
  requestId: string;
  correlationId?: string;
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
  errorCategory?: string;
  startedAt: Date;
  completedAt: Date;
};

export type ApiRequestStartedLogInput = Omit<ApiRequestLogInput, "statusCode" | "success" | "durationMs" | "completedAt" | "response" | "errorName" | "errorMessage" | "errorStack" | "errorCategory">;

export type ApiErrorAlertInput = ApiRequestLogInput & {
  error: unknown;
};

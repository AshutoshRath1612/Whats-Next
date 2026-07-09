import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { appendFile, mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiRequestLogInput, ApiRequestStartedLogInput } from "./api-log.types";
import { sanitizeForLog, sanitizeStack } from "./log-sanitizer";
import { RequestFlowStep } from "./request-flow-context";
import { StructuredLoggerService } from "./structured-logger.service";

@Injectable()
export class ApiLoggerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: StructuredLoggerService
  ) {}

  logStarted(input: ApiRequestStartedLogInput) {
    this.logger.emit("info", {
      event: "api_started",
      message: "Request started.",
      requestId: input.requestId,
      correlationId: input.correlationId,
      method: input.method,
      path: input.path,
      route: input.route,
      handler: formatHandler(input.controller, input.handler),
      controller: input.controller,
      statusCode: undefined,
      responseTimeMs: 0,
      userId: input.userId,
      workspaceId: input.workspaceId,
      ip: input.ip,
      userAgent: input.userAgent
    });
  }

  async log(input: ApiRequestLogInput) {
    const event = input.success ? "api_completed" : "api_failed";
    this.logger.emit(input.success ? "info" : "error", {
      event,
      message: input.success ? "Request completed." : "Request failed.",
      requestId: input.requestId,
      correlationId: input.correlationId,
      method: input.method,
      path: input.path,
      route: input.route,
      handler: formatHandler(input.controller, input.handler),
      controller: input.controller,
      statusCode: input.statusCode,
      responseTimeMs: input.durationMs,
      durationMs: input.durationMs,
      userId: input.userId,
      workspaceId: input.workspaceId,
      ip: input.ip,
      userAgent: input.userAgent,
      success: input.success,
      errorCategory: input.errorCategory,
      error: input.errorMessage
        ? {
            name: input.errorName,
            message: input.errorMessage,
            stack: sanitizeStack(input.errorStack)
          }
        : undefined,
      flowSummary: summarizeApplicationFlow(input.trace)
    });

    await this.writeFlowLogFile(input);

    try {
      await this.prisma.apiRequestLog.create({
        data: {
          requestId: input.requestId,
          method: input.method,
          path: input.path,
          route: input.route,
          controller: input.controller,
          handler: input.handler,
          trace: toPrismaJson(input.trace),
          statusCode: input.statusCode,
          success: input.success,
          durationMs: input.durationMs,
          userId: input.userId,
          workspaceId: input.workspaceId,
          ip: input.ip,
          userAgent: input.userAgent,
          query: toPrismaJson(input.query),
          params: toPrismaJson(input.params),
          body: toPrismaJson(input.body),
          response: toPrismaJson(input.response),
          errorName: input.errorName,
          errorMessage: input.errorMessage,
          errorStack: sanitizeStack(input.errorStack),
          startedAt: input.startedAt,
          completedAt: input.completedAt
        }
      });
    } catch (error) {
      this.logger.emit("warn", {
        event: "api_log_persist_failed",
        message: "Could not persist API request log.",
        requestId: input.requestId,
        error: error instanceof Error ? { name: error.name, message: error.message, stack: sanitizeStack(error.stack) } : error
      });
    }
  }

  private async writeFlowLogFile(input: ApiRequestLogInput) {
    if (this.config.get<string>("API_LOG_FILE_ENABLED") === "false") return;

    const configuredPath = this.config.get<string>("API_LOG_FILE_PATH") || "logs/api-flow.log";
    const logPath = resolveDatedLogPath(configuredPath, input.startedAt);
    const entry = {
      message: input.success ? "Request completed." : "Request failed.",
      event: input.success ? "api_completed" : "api_failed",
      requestId: input.requestId,
      correlationId: input.correlationId,
      outcome: input.success ? "completed" : "failed",
      method: input.method,
      path: input.path,
      route: input.route,
      controller: input.controller,
      handler: input.handler,
      statusCode: input.statusCode,
      responseTimeMs: input.durationMs,
      durationMs: input.durationMs,
      userId: input.userId,
      workspaceId: input.workspaceId,
      ip: input.ip,
      userAgent: input.userAgent,
      request: sanitizeForLog({
        query: input.query,
        params: input.params,
        body: input.body
      }),
      response: sanitizeForLog(input.response),
      error: input.errorMessage
        ? {
            name: input.errorName,
            message: input.errorMessage,
            stack: sanitizeStack(input.errorStack),
            category: input.errorCategory
          }
        : undefined,
      flow: sanitizeForLog(input.trace),
      startedAt: input.startedAt.toISOString(),
      completedAt: input.completedAt.toISOString()
    };

    try {
      await mkdir(dirname(logPath), { recursive: true });
      await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      this.logger.emit("warn", {
        event: "api_log_file_write_failed",
        message: "Could not write API flow log file.",
        requestId: input.requestId,
        path: logPath,
        error: error instanceof Error ? { name: error.name, message: error.message, stack: sanitizeStack(error.stack) } : error
      });
    }
  }
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return sanitizeForLog(value) as Prisma.InputJsonValue;
}

export function resolveDatedLogPath(configuredPath: string, date: Date, cwd = process.cwd()) {
  const logPath = resolve(cwd, configuredPath);
  const day = date.toISOString().slice(0, 10);
  return join(dirname(logPath), `${day}_${basename(logPath)}`);
}

function formatHandler(controller?: string, handler?: string) {
  return [controller, handler].filter(Boolean).join(".") || undefined;
}

function summarizeApplicationFlow(trace: unknown) {
  if (!Array.isArray(trace)) return "no app flow captured";
  const targets = (trace as RequestFlowStep[])
    .filter((step) => {
      const appLayer = step.layer === "controller" || step.layer === "service" || step.layer === "ai";
      const appEvent = step.event === "enter" || step.event === "select" || step.event === "completed" || step.event === "failed" || step.event === "error";
      return appLayer && appEvent;
    })
    .map((step) => step.target ?? step.step)
    .filter(Boolean);
  return [...new Set(targets)].join(" -> ") || "no app flow captured";
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { appendFile, mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiRequestLogInput } from "./api-log.types";
import { sanitizeForLog, sanitizeStack, truncate } from "./log-sanitizer";
import { RequestFlowStep } from "./request-flow-context";

@Injectable()
export class ApiLoggerService {
  private readonly logger = new Logger(ApiLoggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async log(input: ApiRequestLogInput) {
    const level = input.success ? "log" : "warn";
    this.logger[level](formatConsoleLog(input));
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
      this.logger.warn(`Could not persist API request log ${input.requestId}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  private async writeFlowLogFile(input: ApiRequestLogInput) {
    if (this.config.get<string>("API_LOG_FILE_ENABLED") === "false") return;

    const configuredPath = this.config.get<string>("API_LOG_FILE_PATH") || "logs/api-flow.log";
    const logPath = resolveDatedLogPath(configuredPath, input.startedAt);
    const entry = {
      summary: formatConsoleLog(input),
      requestId: input.requestId,
      outcome: input.success ? "completed" : "failed",
      method: input.method,
      path: input.path,
      route: input.route,
      controller: input.controller,
      handler: input.handler,
      statusCode: input.statusCode,
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
            stack: sanitizeStack(input.errorStack)
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
      this.logger.warn(`Could not write API flow log file ${logPath}: ${error instanceof Error ? error.message : "unknown error"}`);
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

function formatConsoleLog(input: ApiRequestLogInput) {
  const status = input.statusCode ?? "unknown";
  const outcome = input.success ? "API completed" : "API failed";
  const handler = [input.controller, input.handler].filter(Boolean).join(".") || input.route || "unknown handler";
  const user = input.userId ? `user=${input.userId}` : "anonymous";
  const workspace = input.workspaceId ? `workspace=${input.workspaceId}` : "workspace=none";
  const error = input.errorMessage ? ` | error=${input.errorName ?? "Error"}: ${input.errorMessage}` : "";
  const request = ` | request=${compactJson({ query: input.query, params: input.params, body: input.body }, 360)}`;
  const response = ` | response=${compactJson(input.response, 360)}`;
  const aiProvider = formatAiProviderSummary(input.trace);
  const flow = ` | flow=${summarizeApplicationFlow(input.trace)}`;

  return `${outcome}: ${input.method} ${input.path} -> ${status} in ${input.durationMs}ms | requestId=${input.requestId} | handler=${handler} | ${user} | ${workspace}${request}${response}${aiProvider}${error}${flow}`;
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

function formatAiProviderSummary(trace: unknown) {
  if (!Array.isArray(trace)) return "";
  const steps = trace as RequestFlowStep[];
  const completed = [...steps].reverse().find((step) => step.step === "ai.provider.completed");
  const failed = [...steps].reverse().find((step) => step.step === "ai.provider.failed");
  const chain = steps.find((step) => step.step === "ai.provider.chain");
  const completedData = readRecord(completed?.data);
  if (completedData) {
    return ` | aiProvider=${formatLogValue(completedData.providerLabel ?? completedData.provider ?? completed?.target)} model=${formatLogValue(completedData.model)} endpoint=${formatLogValue(completedData.endpoint)}`;
  }

  const failedData = readRecord(failed?.data);
  if (failedData) {
    return ` | aiProviderFailed=${formatLogValue(failedData.providerLabel ?? failedData.provider ?? failed?.target)} model=${formatLogValue(failedData.model)} endpoint=${formatLogValue(failedData.endpoint)}`;
  }

  const chainData = readRecord(chain?.data);
  if (chainData) {
    return ` | aiProviderMode=${formatLogValue(chainData.providerMode)}`;
  }
  return "";
}

function readRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function formatLogValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "unknown";
}

function compactJson(value: unknown, maxLength: number) {
  const sanitized = sanitizeForLog(value);
  if (sanitized === undefined || sanitized === null) return "null";
  return truncate(JSON.stringify(sanitized), maxLength);
}

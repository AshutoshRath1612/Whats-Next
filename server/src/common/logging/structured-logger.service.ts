import { Injectable, LoggerService } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import pino, { Logger } from "pino";
import { sanitizeForLog, sanitizeStack } from "./log-sanitizer";
import { getRequestLogContext } from "./request-flow-context";

export type StructuredLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type BusinessEventInput = {
  event: string;
  message: string;
  level?: StructuredLogLevel;
  userId?: string;
  workspaceId?: string;
  data?: Record<string, unknown>;
  error?: unknown;
};

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly logger: Logger;
  private readonly serviceName: string;
  private readonly environment: string;

  constructor(private readonly config: ConfigService) {
    this.serviceName = this.config.get<string>("SERVICE_NAME", "whats-next-api");
    this.environment = this.config.get<string>("NODE_ENV", "development");
    this.logger = pino(
      {
        level: this.config.get<string>("LOG_LEVEL", this.environment === "production" ? "info" : "debug"),
        timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
        base: {
          serviceName: this.serviceName,
          service: this.serviceName,
          environment: this.environment
        },
        formatters: {
          level: (label) => ({ level: label })
        },
        redact: {
          paths: [
            "authorization",
            "Authorization",
            "headers.authorization",
            "headers.cookie",
            "request.headers.authorization",
            "request.headers.cookie",
            "request.body.password",
            "request.body.currentPassword",
            "request.body.nextPassword",
            "request.body.token",
            "request.body.idToken",
            "request.body.refreshToken",
            "request.body.accessToken",
            "request.body.apiKey",
            "request.body.secret",
            "body.password",
            "body.currentPassword",
            "body.nextPassword",
            "body.token",
            "body.idToken",
            "body.refreshToken",
            "body.accessToken",
            "body.apiKey",
            "body.secret",
            "data.password",
            "data.currentPassword",
            "data.nextPassword",
            "data.token",
            "data.idToken",
            "data.refreshToken",
            "data.accessToken",
            "data.apiKey",
            "data.secret",
            "error.config.headers.Authorization",
            "error.response.config.headers.Authorization"
          ],
          censor: "[Redacted]"
        }
      },
      pino.destination({ dest: 1, sync: false })
    );
  }

  trace(message: unknown, context?: string) {
    this.write("trace", "nest_trace", message, context);
  }

  debug(message: unknown, context?: string) {
    this.write("debug", "nest_debug", message, context);
  }

  log(message: unknown, context?: string) {
    this.write("info", "nest_log", message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write("debug", "nest_verbose", message, context);
  }

  warn(message: unknown, context?: string) {
    this.write("warn", "nest_warning", message, context);
  }

  error(message: unknown, traceOrContext?: string, context?: string) {
    const trace = context ? traceOrContext : undefined;
    this.write("error", "nest_error", message, context ?? traceOrContext, trace);
  }

  fatal(message: unknown, traceOrContext?: string, context?: string) {
    const trace = context ? traceOrContext : undefined;
    this.write("fatal", "nest_fatal", message, context ?? traceOrContext, trace);
  }

  emit(level: StructuredLogLevel, input: Record<string, unknown>) {
    this.logger[level](this.normalizeLogObject(input));
  }

  businessEvent(input: BusinessEventInput) {
    const level = input.level ?? (input.error ? "error" : "info");
    this.emit(level, {
      event: input.event,
      message: input.message,
      userId: input.userId,
      workspaceId: input.workspaceId,
      data: input.data,
      error: input.error ? normalizeError(input.error) : undefined
    });
  }

  userLogin(input: Omit<BusinessEventInput, "event" | "message"> & { email?: string }) {
    this.businessEvent({ ...input, event: "user_login", message: "User login completed.", data: { ...input.data, email: input.email } });
  }

  userLogout(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "user_logout", message: "User logout completed." });
  }

  userRegistration(input: Omit<BusinessEventInput, "event" | "message"> & { email?: string }) {
    this.businessEvent({ ...input, event: "user_registration", message: "User registration completed.", data: { ...input.data, email: input.email } });
  }

  aiRequest(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "ai_request", message: "AI request started." });
  }

  aiResponse(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "ai_response", message: "AI response completed." });
  }

  databaseQuery(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "database_query", message: "Database query executed.", level: input.level ?? "debug" });
  }

  cacheHit(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "cache_hit", message: "Cache hit.", level: input.level ?? "debug" });
  }

  cacheMiss(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "cache_miss", message: "Cache miss.", level: input.level ?? "debug" });
  }

  notificationSent(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "notification_sent", message: "Notification sent." });
  }

  emailSent(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "email_sent", message: "Email sent." });
  }

  fileUploaded(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "file_uploaded", message: "File uploaded." });
  }

  fileDeleted(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "file_deleted", message: "File deleted." });
  }

  authorizationFailure(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "authorization_failure", message: "Authorization failure.", level: input.level ?? "warn" });
  }

  validationFailure(input: Omit<BusinessEventInput, "event" | "message">) {
    this.businessEvent({ ...input, event: "validation_failure", message: "Validation failure.", level: input.level ?? "warn" });
  }

  private write(level: StructuredLogLevel, event: string, message: unknown, context?: string, stack?: string) {
    this.emit(level, {
      event,
      context,
      message: typeof message === "string" ? message : "Nest logger event.",
      data: typeof message === "string" ? undefined : message,
      error: stack ? { stack: sanitizeStack(stack) } : undefined
    });
  }

  private normalizeLogObject(input: Record<string, unknown>) {
    const requestContext = getRequestLogContext();
    const sanitizedInput = sanitizeForLog(input);
    return compactObject({
      ...requestContext,
      ...(isRecord(sanitizedInput) ? sanitizedInput : { data: sanitizedInput })
    });
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: sanitizeStack(error.stack)
    };
  }
  return sanitizeForLog(error);
}

function compactObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

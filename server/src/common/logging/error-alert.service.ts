import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiErrorAlertInput } from "./api-log.types";
import { getErrorMessage, getErrorName, sanitizeForLog, truncate } from "./log-sanitizer";

@Injectable()
export class ErrorAlertService {
  private readonly logger = new Logger(ErrorAlertService.name);
  private readonly sentAtByFingerprint = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  async notify(input: ApiErrorAlertInput) {
    if (this.config.get<string>("ERROR_ALERT_ENABLED", "true") !== "true") return;

    const minStatus = Number(this.config.get<string>("ERROR_ALERT_MIN_STATUS", "400"));
    const statusCode = input.statusCode ?? 500;
    if (statusCode < minStatus) return;

    const to = this.config.get<string>("ADMIN_ERROR_ALERT_EMAIL");
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    const from = this.config.get<string>("EMAIL_FROM", "What's Next? <noreply@whatsnext.local>");
    if (!to || !apiKey || !from) {
      this.logger.warn(`Error alert skipped for request ${input.requestId}: ADMIN_ERROR_ALERT_EMAIL or Resend configuration is missing.`);
      return;
    }

    const fingerprint = [input.method, input.route ?? input.path, statusCode, input.errorName, input.errorMessage].join("|");
    const cooldownMs = Number(this.config.get<string>("ERROR_ALERT_COOLDOWN_SECONDS", "60")) * 1000;
    const previousSentAt = this.sentAtByFingerprint.get(fingerprint) ?? 0;
    if (Date.now() - previousSentAt < cooldownMs) return;
    this.sentAtByFingerprint.set(fingerprint, Date.now());

    const subject = `[What's Next?] API error ${statusCode} ${input.method} ${input.route ?? input.path}`;
    const text = buildAlertText(input);

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from, to, subject, text })
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.logger.warn(`Error alert email failed for request ${input.requestId}: ${body || response.statusText}`);
      }
    } catch (error) {
      this.logger.warn(`Error alert email failed for request ${input.requestId}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

function buildAlertText(input: ApiErrorAlertInput) {
  return [
    "What's Next? API error alert",
    "",
    `Request ID: ${input.requestId}`,
    `Status: ${input.statusCode ?? 500}`,
    `Method: ${input.method}`,
    `Path: ${input.path}`,
    `Route: ${input.route ?? "unknown"}`,
    `User ID: ${input.userId ?? "anonymous"}`,
    `Workspace ID: ${input.workspaceId ?? "none"}`,
    `IP: ${input.ip ?? "unknown"}`,
    `User agent: ${input.userAgent ?? "unknown"}`,
    `Started: ${input.startedAt.toISOString()}`,
    `Completed: ${input.completedAt.toISOString()}`,
    `Duration: ${input.durationMs}ms`,
    "",
    `Error: ${input.errorName ?? getErrorName(input.error)}`,
    `Message: ${input.errorMessage ?? getErrorMessage(input.error)}`,
    "",
    "Query:",
    JSON.stringify(sanitizeForLog(input.query ?? {}), null, 2),
    "",
    "Params:",
    JSON.stringify(sanitizeForLog(input.params ?? {}), null, 2),
    "",
    "Body:",
    JSON.stringify(sanitizeForLog(input.body ?? {}), null, 2),
    "",
    "Stack:",
    truncate(input.errorStack ?? (input.error instanceof Error ? input.error.stack ?? "" : ""), 4_000)
  ].join("\n");
}

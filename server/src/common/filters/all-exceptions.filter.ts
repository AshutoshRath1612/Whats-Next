import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Response } from "express";
import { ApiLogRequest } from "../logging/api-log.types";
import { ApiLoggerService } from "../logging/api-logger.service";
import { ErrorAlertService } from "../logging/error-alert.service";
import { getErrorMessage, getErrorName, sanitizeStack } from "../logging/log-sanitizer";
import { extractWorkspaceId, getOrCreateRequestId, getRequestUserId, getRoutePath } from "../logging/request-context";
import { addFlowStep, getFlowResponseBody, getFlowSteps, setFlowResponseBody } from "../logging/request-flow-context";

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly errorAlert: ErrorAlertService,
    private readonly apiLogger: ApiLoggerService
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<ApiLogRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : "Unexpected server error";
    const requestId = getOrCreateRequestId(request);
    const timestamp = new Date();
    const startedAt = request.requestStartedAt ?? timestamp;
    const responseBody = {
      statusCode: status,
      error: typeof payload === "string" ? payload : (payload as Record<string, unknown>).error,
      message: typeof payload === "string" ? payload : (payload as Record<string, unknown>).message,
      timestamp: timestamp.toISOString(),
      requestId
    };

    setFlowResponseBody(responseBody);
    addFlowStep({
      step: "exception.filter",
      layer: "exception",
      event: "failed",
      target: "AllExceptionsFilter.catch",
      at: timestamp,
      durationMs: timestamp.getTime() - startedAt.getTime(),
      description: "Global exception filter converted the thrown error into a safe HTTP response.",
      data: { response: responseBody },
      error: {
        name: getErrorName(exception),
        message: getErrorMessage(exception)
      }
    });

    const logInput = {
      requestId,
      method: request.method,
      path: request.originalUrl,
      route: getRoutePath(request),
      trace: getFlowSteps(),
      statusCode: status,
      success: false,
      durationMs: timestamp.getTime() - startedAt.getTime(),
      userId: getRequestUserId(request),
      workspaceId: extractWorkspaceId(request),
      ip: request.ip,
      userAgent: Array.isArray(request.headers["user-agent"]) ? request.headers["user-agent"][0] : request.headers["user-agent"],
      query: request.query,
      params: request.params,
      body: request.body,
      response: getFlowResponseBody(),
      errorName: getErrorName(exception),
      errorMessage: getErrorMessage(exception),
      errorStack: sanitizeStack(exception instanceof Error ? exception.stack : undefined),
      startedAt,
      completedAt: timestamp
    };

    if (!request.apiLogWritten) {
      request.apiLogWritten = true;
      void this.apiLogger.log(logInput);
    }

    void this.errorAlert.notify({
      ...logInput,
      error: exception
    });

    response.status(status).json(responseBody);
  }
}

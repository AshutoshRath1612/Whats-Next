import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Response } from "express";
import { ApiLogRequest } from "../logging/api-log.types";
import { ApiLoggerService } from "../logging/api-logger.service";
import { classifyError } from "../logging/error-category";
import { ErrorAlertService } from "../logging/error-alert.service";
import { getErrorMessage, getErrorName, sanitizeStack } from "../logging/log-sanitizer";
import { extractWorkspaceId, getCorrelationId, getOrCreateRequestId, getRequestUserId, getRoutePath } from "../logging/request-context";
import { addFlowStep, getFlowResponseBody, getFlowSteps, getRequestLogContext, setFlowResponseBody } from "../logging/request-flow-context";
import { StructuredLoggerService } from "../logging/structured-logger.service";

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly errorAlert: ErrorAlertService,
    private readonly apiLogger: ApiLoggerService,
    private readonly structuredLogger: StructuredLoggerService
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<ApiLogRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : "Unexpected server error";
    const requestId = getOrCreateRequestId(request);
    const correlationId = getCorrelationId(request);
    const timestamp = new Date();
    const startedAt = request.requestStartedAt ?? timestamp;
    const durationMs = request.requestStartedHrtimeNs ? Number((process.hrtime.bigint() - request.requestStartedHrtimeNs) / 1_000_000n) : timestamp.getTime() - startedAt.getTime();
    const routeContext = getRequestLogContext();
    const errorCategory = classifyError(exception);
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
      durationMs,
      description: "Global exception filter converted the thrown error into a safe HTTP response.",
      data: { response: responseBody },
      error: {
        name: getErrorName(exception),
        message: getErrorMessage(exception)
      }
    });

    const logInput = {
      requestId,
      correlationId,
      method: request.method,
      path: request.originalUrl,
      route: getRoutePath(request),
      controller: routeContext.controller,
      handler: routeContext.handler,
      trace: getFlowSteps(),
      statusCode: status,
      success: false,
      durationMs,
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
      errorCategory,
      startedAt,
      completedAt: timestamp
    };

    if (!request.apiLogWritten) {
      request.apiLogWritten = true;
      void this.apiLogger.log(logInput);
    }

    if (errorCategory === "Validation") {
      this.structuredLogger.validationFailure({
        userId: logInput.userId,
        workspaceId: logInput.workspaceId,
        data: {
          method: logInput.method,
          path: logInput.path,
          statusCode: logInput.statusCode,
          exceptionType: logInput.errorName,
          message: logInput.errorMessage
        }
      });
    } else if (errorCategory === "Authentication" || errorCategory === "Authorization") {
      this.structuredLogger.authorizationFailure({
        userId: logInput.userId,
        workspaceId: logInput.workspaceId,
        data: {
          method: logInput.method,
          path: logInput.path,
          statusCode: logInput.statusCode,
          category: errorCategory,
          exceptionType: logInput.errorName,
          message: logInput.errorMessage
        }
      });
    }

    void this.errorAlert.notify({
      ...logInput,
      error: exception
    });

    response.status(status).json(responseBody);
  }
}

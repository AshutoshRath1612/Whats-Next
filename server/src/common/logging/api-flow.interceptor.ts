import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Response } from "express";
import { catchError, Observable, tap, throwError } from "rxjs";
import { ApiLogRequest, ApiRequestLogInput } from "./api-log.types";
import { ApiLoggerService } from "./api-logger.service";
import { getErrorMessage, getErrorName } from "./log-sanitizer";
import { extractWorkspaceId, getCorrelationId, getOrCreateRequestId, getRequestUserId, getRoutePath } from "./request-context";
import { addFlowStep, getFlowResponseBody, getFlowSteps, setFlowResponseBody, updateRequestLogContext } from "./request-flow-context";

@Injectable()
export class ApiFlowInterceptor implements NestInterceptor {
  constructor(private readonly apiLogger: ApiLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<ApiLogRequest>();
    const response = http.getResponse<Response>();
    const startedAt = new Date();
    const startedNs = process.hrtime.bigint();
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const baseLog = this.buildBaseLog(request, startedAt, controller, handler);
    const controllerTarget = `${controller}.${handler}`;
    updateRequestLogContext(baseLog);
    this.apiLogger.logStarted(baseLog);

    addFlowStep({
      step: "controller.enter",
      layer: "controller",
      event: "enter",
      target: controllerTarget,
      at: startedAt,
      description: `Routing request to ${controllerTarget}.`,
      data: {
        route: baseLog.route,
        query: request.query,
        params: request.params,
        body: request.body
      }
    });

    return next.handle().pipe(
      tap((result) => {
        setFlowResponseBody(result);
        addFlowStep({
          step: "controller.completed",
          layer: "controller",
          event: "completed",
          target: controllerTarget,
          durationMs: elapsedMs(startedNs),
          description: `${controllerTarget} returned a successful response.`,
          data: { response: result }
        });
        request.apiLogWritten = true;
        void this.apiLogger.log({
          ...baseLog,
          statusCode: response.statusCode,
          success: response.statusCode < 400,
          durationMs: elapsedMs(startedNs),
          completedAt: new Date(),
          response: getFlowResponseBody(),
          trace: getFlowSteps()
        });
      }),
      catchError((error: unknown) => {
        addFlowStep({
          step: "controller.failed",
          layer: "controller",
          event: "failed",
          target: controllerTarget,
          durationMs: elapsedMs(startedNs),
          description: `${controllerTarget} failed before returning a successful response.`,
          error: {
            name: getErrorName(error),
            message: getErrorMessage(error)
          }
        });
        return throwError(() => error);
      })
    );
  }

  private buildBaseLog(request: ApiLogRequest, startedAt: Date, controller: string, handler: string): Omit<ApiRequestLogInput, "statusCode" | "success" | "durationMs" | "completedAt"> {
    return {
      requestId: getOrCreateRequestId(request),
      correlationId: getCorrelationId(request),
      method: request.method,
      path: request.originalUrl,
      route: getRoutePath(request),
      controller,
      handler,
      userId: getRequestUserId(request),
      workspaceId: extractWorkspaceId(request),
      ip: getClientIp(request),
      userAgent: getHeader(request.headers["user-agent"]),
      query: request.query,
      params: request.params,
      body: request.body,
      startedAt
    };
  }
}

function elapsedMs(startedNs: bigint) {
  return Number((process.hrtime.bigint() - startedNs) / 1_000_000n);
}

function getHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(request: ApiLogRequest) {
  const forwarded = getHeader(request.headers["x-forwarded-for"]);
  return forwarded?.split(",")[0]?.trim() || request.ip;
}

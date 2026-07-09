import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Response } from "express";
import { ApiLogRequest } from "./api-log.types";
import { getCorrelationId, getOrCreateRequestId } from "./request-context";
import { addFlowStep, runWithRequestFlow } from "./request-flow-context";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: ApiLogRequest, response: Response, next: NextFunction) {
    const requestId = getOrCreateRequestId(request);
    const correlationId = getCorrelationId(request);
    const startedAt = new Date();
    request.requestStartedAt = startedAt;
    request.requestStartedHrtimeNs = process.hrtime.bigint();
    response.setHeader("x-request-id", requestId);
    if (correlationId) response.setHeader("x-correlation-id", correlationId);
    runWithRequestFlow({ requestId, correlationId, startedAt }, () => {
      addFlowStep({
        step: "http.request.received",
        layer: "http",
        event: "received",
        target: `${request.method} ${request.originalUrl}`,
        at: startedAt,
        description: "Incoming HTTP request accepted by the API gateway middleware.",
        data: {
          method: request.method,
          path: request.originalUrl,
          query: request.query,
          params: request.params,
          body: request.body,
          ip: request.ip,
          userAgent: request.headers["user-agent"]
        }
      });
      next();
    });
  }
}

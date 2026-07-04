import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Response } from "express";
import { ApiLogRequest } from "./api-log.types";
import { getOrCreateRequestId } from "./request-context";
import { addFlowStep, runWithRequestFlow } from "./request-flow-context";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: ApiLogRequest, response: Response, next: NextFunction) {
    const requestId = getOrCreateRequestId(request);
    const startedAt = new Date();
    request.requestStartedAt = startedAt;
    response.setHeader("x-request-id", requestId);
    runWithRequestFlow({ requestId, startedAt }, () => {
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

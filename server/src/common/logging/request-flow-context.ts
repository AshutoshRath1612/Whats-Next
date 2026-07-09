import { AsyncLocalStorage } from "node:async_hooks";
import { sanitizeForLog } from "./log-sanitizer";

export type RequestFlowStep = {
  sequence: number;
  step: string;
  layer: "http" | "controller" | "service" | "database" | "exception" | "ai";
  event: "received" | "enter" | "exit" | "error" | "completed" | "failed" | "query" | "select";
  at: string;
  target?: string;
  durationMs?: number;
  description?: string;
  data?: unknown;
  error?: unknown;
};

type RequestFlowStore = {
  requestId: string;
  correlationId?: string;
  startedAt: Date;
  steps: RequestFlowStep[];
  responseBody?: unknown;
  method?: string;
  path?: string;
  route?: string;
  controller?: string;
  handler?: string;
  userId?: string;
  workspaceId?: string;
  ip?: string;
  userAgent?: string;
};

const storage = new AsyncLocalStorage<RequestFlowStore>();

export function runWithRequestFlow<T>(input: { requestId: string; correlationId?: string; startedAt: Date }, callback: () => T) {
  return storage.run({ requestId: input.requestId, correlationId: input.correlationId, startedAt: input.startedAt, steps: [] }, callback);
}

export function getRequestLogContext() {
  const store = storage.getStore();
  if (!store) return {};
  return {
    requestId: store.requestId,
    correlationId: store.correlationId,
    method: store.method,
    path: store.path,
    route: store.route,
    controller: store.controller,
    handler: store.handler,
    userId: store.userId,
    workspaceId: store.workspaceId,
    ip: store.ip,
    userAgent: store.userAgent
  };
}

export function updateRequestLogContext(input: Partial<Omit<RequestFlowStore, "steps" | "startedAt">>) {
  const store = storage.getStore();
  if (!store) return;
  Object.assign(store, input);
}

export function addFlowStep(input: Omit<RequestFlowStep, "sequence" | "at"> & { at?: Date | string }) {
  const store = storage.getStore();
  if (!store) return;

  store.steps.push({
    sequence: store.steps.length + 1,
    at: typeof input.at === "string" ? input.at : (input.at ?? new Date()).toISOString(),
    step: input.step,
    layer: input.layer,
    event: input.event,
    target: input.target,
    durationMs: input.durationMs,
    description: input.description,
    data: sanitizeForLog(input.data),
    error: sanitizeForLog(input.error)
  });
}

export function getFlowSteps() {
  return storage.getStore()?.steps ?? [];
}

export function setFlowResponseBody(responseBody: unknown) {
  const store = storage.getStore();
  if (!store) return;
  store.responseBody = sanitizeForLog(responseBody);
}

export function getFlowResponseBody() {
  return storage.getStore()?.responseBody;
}

export function summarizeFlowSteps(steps: RequestFlowStep[] = getFlowSteps()) {
  if (steps.length === 0) return "no flow steps captured";
  return steps
    .map((step) => {
      const duration = typeof step.durationMs === "number" ? ` ${step.durationMs}ms` : "";
      return `${step.sequence}.${step.layer}.${step.event}:${step.target ?? step.step}${duration}`;
    })
    .join(" -> ");
}

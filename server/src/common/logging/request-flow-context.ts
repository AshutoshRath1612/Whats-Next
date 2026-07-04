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
  startedAt: Date;
  steps: RequestFlowStep[];
  responseBody?: unknown;
};

const storage = new AsyncLocalStorage<RequestFlowStore>();

export function runWithRequestFlow<T>(input: { requestId: string; startedAt: Date }, callback: () => T) {
  return storage.run({ requestId: input.requestId, startedAt: input.startedAt, steps: [] }, callback);
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

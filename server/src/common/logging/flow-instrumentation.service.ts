import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { addFlowStep } from "./request-flow-context";

const skippedMethodNames = new Set([
  "constructor",
  "onModuleInit",
  "onModuleDestroy",
  "onApplicationBootstrap",
  "onApplicationShutdown",
  "beforeApplicationShutdown"
]);

const skippedProviderNames = new Set([
  "ApiLoggerService",
  "ApiFlowInterceptor",
  "ConfigService",
  "ErrorAlertService",
  "FlowInstrumentationService",
  "PrismaService",
  "RequestIdMiddleware"
]);

const publicServiceMethods: Record<string, string[]> = {
  AiService: ["suggest", "askWorkspace"],
  AnalyticsService: ["dashboard"],
  ArticlesService: ["list", "create", "update"],
  AuthService: ["register", "login", "googleLogin", "logout", "forgotPassword", "resetPassword"],
  CalendarService: ["list", "create", "update", "delete"],
  FilesService: ["list", "storageUsage", "create", "upload", "update", "delete"],
  NotesService: ["list", "create", "update"],
  NotificationsService: ["list", "sendDailySummary", "sendDeadlineReminders"],
  ProjectsService: ["list", "create", "update", "archive", "unarchive"],
  SearchService: ["global"],
  SqlService: ["list", "create", "update"],
  TasksService: ["list", "create", "update", "updateStatus"],
  TemplatesService: ["list", "create", "update"],
  TicketsService: ["list", "create"],
  TimeService: ["list", "start", "manual", "toggle", "stop"],
  UsersService: ["me", "updateProfile", "changePassword", "sessions", "logoutAll"],
  WorkspacesService: ["listForUser", "create", "update", "archive"]
};

@Injectable()
export class FlowInstrumentationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FlowInstrumentationService.name);

  constructor(private readonly discovery: DiscoveryService) {}

  onApplicationBootstrap() {
    let wrappedCount = 0;

    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      const providerName = wrapper.metatype?.name ?? instance?.constructor?.name;
      if (!instance || !providerName || !shouldTraceProvider(providerName)) continue;

      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
      if (!prototype) continue;

      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (skippedMethodNames.has(methodName) || !shouldTraceMethod(providerName, methodName)) continue;
        const original = instance[methodName];
        if (typeof original !== "function" || isWrapped(original as (...args: unknown[]) => unknown)) continue;

        instance[methodName] = buildWrappedMethod(providerName, methodName, original as (...args: unknown[]) => unknown);
        wrappedCount += 1;
      }
    }

    this.logger.log(`API flow instrumentation active for ${wrappedCount} service methods.`);
  }
}

function shouldTraceProvider(providerName: string) {
  return providerName.endsWith("Service") && !skippedProviderNames.has(providerName) && providerName in publicServiceMethods;
}

function shouldTraceMethod(providerName: string, methodName: string) {
  return publicServiceMethods[providerName]?.includes(methodName) ?? false;
}

function buildWrappedMethod(providerName: string, methodName: string, original: (...args: unknown[]) => unknown) {
  const target = `${providerName}.${methodName}`;
  const wrapped = function tracedServiceMethod(this: unknown, ...args: unknown[]) {
    const startedMs = Date.now();
    addFlowStep({
      step: "service.enter",
      layer: "service",
      event: "enter",
      target,
      description: `Entering ${target}.`,
      data: { args: summarizeArgs(args) }
    });

    try {
      const result = original.apply(this, args);
      if (isPromiseLike(result)) {
        return result.then(
          (value) => {
            addServiceExitStep(target, startedMs, value);
            return value;
          },
          (error) => {
            addServiceErrorStep(target, startedMs, error);
            throw error;
          }
        );
      }

      addServiceExitStep(target, startedMs, result);
      return result;
    } catch (error) {
      addServiceErrorStep(target, startedMs, error);
      throw error;
    }
  };

  Object.defineProperty(wrapped, "__flowWrapped", { value: true });
  return wrapped;
}

function addServiceExitStep(target: string, startedMs: number, result: unknown) {
  addFlowStep({
    step: "service.exit",
    layer: "service",
    event: "exit",
    target,
    durationMs: Date.now() - startedMs,
    description: `${target} completed.`,
    data: { result }
  });
}

function addServiceErrorStep(target: string, startedMs: number, error: unknown) {
  addFlowStep({
    step: "service.error",
    layer: "service",
    event: "error",
    target,
    durationMs: Date.now() - startedMs,
    description: `${target} threw an error.`,
    error
  });
}

function summarizeArgs(args: unknown[]) {
  return args.map((arg) => {
    if (typeof arg === "string" || typeof arg === "number" || typeof arg === "boolean" || arg === null || arg === undefined) return arg;
    if (Array.isArray(arg)) return { type: "array", length: arg.length, sample: arg.slice(0, 5) };
    if (arg instanceof Date) return arg.toISOString();
    if (typeof arg === "object") return arg;
    return String(arg);
  });
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as Promise<unknown>).then === "function");
}

function isWrapped(value: (...args: unknown[]) => unknown) {
  return Boolean((value as { __flowWrapped?: boolean }).__flowWrapped);
}

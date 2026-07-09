import { BadRequestException, ForbiddenException, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { addFlowStep } from "../common/logging/request-flow-context";
import { StructuredLoggerService } from "../common/logging/structured-logger.service";
import { PrismaService } from "../prisma/prisma.service";

type AiProviderName = "openai" | "groq" | "puter";
type AiProviderMode = AiProviderName | "auto";
type AiProviderKind = "openai-compatible" | "puter";

type AiProviderConfig = {
  name: AiProviderName;
  kind: AiProviderKind;
  label: string;
  apiKey?: string;
  authToken?: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  modelEnv: string;
  baseUrlEnv: string;
};

type AiProviderResponse = {
  content: string;
  provider: AiProviderName;
  providerLabel: string;
  model: string;
  baseUrl: string;
};

type PuterRuntime = {
  ai?: {
    chat?: (messages: Array<{ role: string; content: string }>, options?: Record<string, unknown>) => Promise<unknown>;
  };
  auth?: {
    getMonthlyUsage?: () => Promise<unknown>;
  };
};

type PuterInitModule = {
  init?: (authToken?: string) => PuterRuntime;
};

type PuterUsageSummary = {
  allowance?: number;
  remaining?: number;
  used?: number;
  usedPercent?: number;
};

type PuterUsageCache = {
  authToken: string;
  expiresAt: number;
  summary: PuterUsageSummary;
};

type GroundingSourceType = "Knowledge Article" | "Task" | "Ticket" | "Note" | "SQL Snippet" | "File" | "Time Entry";

type GroundingSource = {
  sourceId: string;
  type: GroundingSourceType;
  id: string;
  title: string;
  summary: string;
  score: number;
  facts?: SourceFacts;
};

type RetrievalContext = {
  type: GroundingSourceType;
  id: string;
  title: string;
  text: string;
  summary: string;
  aliases: string[];
  workState?: "open" | "closed";
  facts?: SourceFacts;
};

type IndexedRetrievalContext = RetrievalContext & {
  normalizedTitle: string;
  normalizedSearchText: string;
  normalizedContentText: string;
  searchTokens: Set<string>;
  contentTokens: Set<string>;
};

type SourceFacts = {
  createdAt?: string;
  status?: string;
  priority?: string;
  progressPercent?: number;
  checklistDone?: number;
  checklistTotal?: number;
  actualMinutes?: number;
  estimateMinutes?: number;
  startDate?: string;
  dueDate?: string;
  updatedAt?: string;
  isOverdue?: boolean;
  daysOverdue?: number;
  isDueToday?: boolean;
  isDueThisWeek?: boolean;
  isDueThisMonth?: boolean;
  workState?: "open" | "closed";
  description?: string;
  ticketNumber?: string;
  customer?: string;
  severity?: string;
  investigation?: string;
  rootCause?: string;
  resolution?: string;
  closureNotes?: string;
  acceptanceCriteria?: string;
  notes?: string;
  latestNote?: string;
  latestNoteAt?: string;
  durationSec?: number;
  durationMin?: number;
  timeEntryCount?: number;
  timeRangeLabel?: string;
  taskTitle?: string;
  taskId?: string;
  activityReason?: string;
};

type TemporalHint = "today" | "tomorrow" | "this-week" | "this-month" | "overdue" | "recent";
type QueryIntent = "open-work" | "priority-work" | "latest-update" | "time-summary" | "activity-summary" | "task-progress" | "status-check" | "ticket-resolution" | "knowledge-lookup";
type TimeQueryRange = { key: string; label: string; start: Date; end: Date };

type QueryUnderstanding = {
  original: string;
  normalizedQuestion: string;
  intents: Set<QueryIntent>;
  quotedPhrases: string[];
  contentTerms: string[];
  terms: string[];
  phraseTerms: string[];
  sourceTypeHints: Set<GroundingSourceType>;
  temporalHints: Set<TemporalHint>;
};

const defaultSystemPrompt = "You are What's Next?'s productivity assistant. Be concise, specific, and action-oriented.";
const groundedSystemPrompt = [
  "You are What's Next?'s grounded workspace knowledge assistant.",
  "Answer only from the provided workspace sources, but translate raw records into useful workspace guidance.",
  "If the sources do not contain enough relevant evidence, say that you do not have sufficient information.",
  "Do not invent root causes, steps, ticket history, SQL behavior, filenames, or relationships.",
  "Do not expose internal record ids unless the user explicitly asks for ids.",
  "Cite source ids like [S1] beside claims that rely on workspace context."
].join(" ");

@Injectable()
export class AiService {
  private puterUsageCache?: PuterUsageCache;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly logger?: StructuredLoggerService
  ) {}

  async suggest(userId: string, prompt: string) {
    return this.generateText(userId, prompt);
  }

  async generateText(userId: string, prompt: string, systemPrompt = defaultSystemPrompt) {
    this.logger?.aiRequest({
      userId,
      data: {
        source: "assistant",
        promptCharacters: prompt.length,
        systemPromptCharacters: systemPrompt.length,
        providerMode: this.getRequestedProviderMode()
      }
    });
    await this.prisma.aiMessage.create({ data: { userId, role: "user", content: prompt } });
    const result = await this.generateProviderResponse(prompt, systemPrompt);
    await this.prisma.aiMessage.create({ data: { userId, role: "assistant", content: result.content } });
    this.logger?.aiResponse({
      userId,
      data: {
        source: "assistant",
        provider: result.provider,
        providerLabel: result.providerLabel,
        model: result.model,
        responseCharacters: result.content.length
      }
    });
    return {
      content: result.content,
      provider: result.provider,
      providerLabel: result.providerLabel,
      model: result.model
    };
  }

  async askWorkspace(userId: string, workspaceId: string, question: string) {
    if (!workspaceId) throw new BadRequestException("workspaceId is required");
    const normalizedQuestion = question.trim();
    if (normalizedQuestion.length < 3) throw new BadRequestException("Question must be at least 3 characters.");
    await this.assertWorkspaceAccess(userId, workspaceId);

    await this.prisma.aiMessage.create({ data: { userId, role: "user", content: normalizedQuestion } });
    this.logger?.aiRequest({
      userId,
      workspaceId,
      data: {
        source: "workspace_knowledge",
        questionCharacters: normalizedQuestion.length,
        providerMode: this.getRequestedProviderMode()
      }
    });
    const query = understandQuestion(normalizedQuestion);
    const sources = await this.retrieveGroundingSources(userId, workspaceId, normalizedQuestion, query);
    addFlowStep({
      step: "ai.retrieval.completed",
      layer: "ai",
      event: "completed",
      target: "Workspace knowledge retrieval",
      description: "Retrieved workspace records for a grounded AI answer.",
      data: {
        workspaceId,
        questionLength: normalizedQuestion.length,
        sourceCount: sources.length,
        sources: sources.map(({ sourceId, type, id, title, score }) => ({ sourceId, type, id, title, score }))
      }
    });

    if (sources.length === 0) {
      const content = "I do not have sufficient relevant workspace information to answer that confidently. Try adding any concrete clue you remember, such as a ticket number, error text, customer name, SQL purpose, note topic, file name, date range, or what happened, then ask again.";
      await this.prisma.aiMessage.create({ data: { userId, role: "assistant", content } });
      this.logger?.aiResponse({
        userId,
        workspaceId,
        level: "warn",
        data: {
          source: "workspace_knowledge",
          sufficientContext: false,
          sourceCount: 0,
          responseCharacters: content.length
        }
      });
      return {
        content,
        sufficientContext: false,
        sources: [] as GroundingSource[]
      };
    }

    const templatedAnswer = buildTemplatedAnswer(query, sources);
    if (templatedAnswer) {
      await this.prisma.aiMessage.create({ data: { userId, role: "assistant", content: templatedAnswer } });
      this.logger?.aiResponse({
        userId,
        workspaceId,
        data: {
          source: "workspace_knowledge",
          answerMode: "template",
          sufficientContext: true,
          sourceCount: sources.length,
          responseCharacters: templatedAnswer.length
        }
      });
      return {
        content: templatedAnswer,
        sufficientContext: true,
        sources
      };
    }

    const prompt = buildGroundedPrompt(normalizedQuestion, sources, query);
    const result = await this.generateProviderResponse(prompt, groundedSystemPrompt);
    await this.prisma.aiMessage.create({ data: { userId, role: "assistant", content: result.content } });
    this.logger?.aiResponse({
      userId,
      workspaceId,
      data: {
        source: "workspace_knowledge",
        answerMode: "provider",
        sufficientContext: true,
        sourceCount: sources.length,
        provider: result.provider,
        providerLabel: result.providerLabel,
        model: result.model,
        responseCharacters: result.content.length
      }
    });

    return {
      content: result.content,
      provider: result.provider,
      providerLabel: result.providerLabel,
      model: result.model,
      sufficientContext: true,
      sources
    };
  }

  private async generateProviderResponse(prompt: string, systemPrompt = defaultSystemPrompt): Promise<AiProviderResponse> {
    const providerMode = this.getRequestedProviderMode();
    const providers = this.getProviderChain(providerMode);
    addFlowStep({
      step: "ai.provider.chain",
      layer: "ai",
      event: "select",
      target: "AI provider selection",
      description: "Resolved the configured AI provider chain for this request.",
      data: {
        providerMode,
        configuredProviders: providers.map(toProviderLogInfo)
      }
    });

    if (providers.length === 0) {
      throw new ServiceUnavailableException("AI provider is not configured. Set a real OPENAI_API_KEY, GROQ_API_KEY, or PUTER_AUTH_TOKEN in server/.env, then restart the server.");
    }

    const failures: string[] = [];
    for (const provider of providers) {
      try {
        if (provider.kind === "puter") {
          const budgetDecision = await this.getPuterBudgetDecision(provider);
          if (!budgetDecision.allow) {
            failures.push(`${provider.label}: ${budgetDecision.reason}`);
            continue;
          }
          return await this.requestPuterChatCompletion(provider, prompt, systemPrompt);
        }
        return await this.requestChatCompletion(provider, prompt, systemPrompt);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown provider error";
        failures.push(`${provider.label}: ${message}`);
      }
    }

    addFlowStep({
      step: "ai.provider.exhausted",
      layer: "ai",
      event: "failed",
      target: "AI provider fallback",
      description: "Every configured AI provider failed for this request.",
      data: { providerMode, failures }
    });
    throw new ServiceUnavailableException(`All configured AI providers failed. ${failures.join(" | ")}`);
  }

  private getRequestedProviderMode(): AiProviderMode {
    const requestedProvider = (this.config.get<string>("AI_PROVIDER") ?? "auto").trim().toLowerCase();
    if (requestedProvider === "openai" || requestedProvider === "groq" || requestedProvider === "puter") return requestedProvider;
    return "auto";
  }

  private getProviderChain(requestedProvider: AiProviderMode) {
    const openai = this.getOpenAiProvider();
    const groq = this.getGroqProvider();
    const puter = this.getPuterProvider();
    const allProviders = [openai, groq, puter].filter(isConfiguredProvider);
    const providerMap = new Map<AiProviderName, AiProviderConfig>(allProviders.map((provider) => [provider.name, provider]));

    if (requestedProvider === "openai") return allProviders.filter((provider) => provider.name === "openai");
    if (requestedProvider === "groq") return allProviders.filter((provider) => provider.name === "groq");
    if (requestedProvider === "puter") return allProviders.filter((provider) => provider.name === "puter");
    return this.getAutoProviderOrder().map((providerName) => providerMap.get(providerName)).filter((provider): provider is AiProviderConfig => Boolean(provider));
  }

  private getAutoProviderOrder(): AiProviderName[] {
    const rawOrder = this.config.get<string>("AI_AUTO_PROVIDER_ORDER");
    const parsedOrder = (rawOrder ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is AiProviderName => value === "openai" || value === "groq" || value === "puter");
    const uniqueOrder = Array.from(new Set(parsedOrder));
    return uniqueOrder.length ? uniqueOrder : ["openai", "groq", "puter"];
  }

  private getOpenAiProvider(): AiProviderConfig {
    return {
      name: "openai",
      kind: "openai-compatible",
      label: "OpenAI",
      apiKey: this.config.get<string>("OPENAI_API_KEY"),
      baseUrl: this.config.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
      model: this.config.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini",
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrlEnv: "OPENAI_BASE_URL",
      modelEnv: "OPENAI_MODEL"
    };
  }

  private getGroqProvider(): AiProviderConfig {
    return {
      name: "groq",
      kind: "openai-compatible",
      label: "Groq",
      apiKey: this.config.get<string>("GROQ_API_KEY"),
      baseUrl: this.config.get<string>("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1",
      model: this.config.get<string>("GROQ_MODEL") ?? "llama-3.1-8b-instant",
      apiKeyEnv: "GROQ_API_KEY",
      baseUrlEnv: "GROQ_BASE_URL",
      modelEnv: "GROQ_MODEL"
    };
  }

  private getPuterProvider(): AiProviderConfig {
    return {
      name: "puter",
      kind: "puter",
      label: "Puter",
      authToken: this.config.get<string>("PUTER_AUTH_TOKEN"),
      baseUrl: "puter://ai.chat",
      model: this.config.get<string>("PUTER_MODEL") ?? "gpt-5.4-mini",
      apiKeyEnv: "PUTER_AUTH_TOKEN",
      baseUrlEnv: "PUTER_RUNTIME",
      modelEnv: "PUTER_MODEL"
    };
  }

  private async requestChatCompletion(provider: AiProviderConfig, prompt: string, systemPrompt: string): Promise<AiProviderResponse> {
    const startedAt = Date.now();
    const endpoint = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const providerLogInfo = toProviderLogInfo(provider);
    addFlowStep({
      step: "ai.provider.request",
      layer: "ai",
      event: "enter",
      target: `${provider.label}.chat.completions`,
      description: `Calling ${provider.label} chat completions API.`,
      data: { ...providerLogInfo, endpoint }
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          temperature: 0.3
        })
      });
    } catch (error) {
      const message = `${provider.label} network request failed: ${error instanceof Error ? error.message : "unknown network error"}.`;
      addAiProviderFailureStep(provider, startedAt, message, error, { endpoint });
      throw new ServiceUnavailableException(message);
    }

    const responseText = await response.text();
    const payload = parseProviderJson(responseText);
    if (!response.ok) {
      const message = buildProviderFailureMessage(provider, response.status, response.statusText, payload, responseText);
      addAiProviderFailureStep(provider, startedAt, message, undefined, {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        providerMessage: extractProviderMessage(payload) ?? responseText.slice(0, 240)
      });
      throw new ServiceUnavailableException(message);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      const message = `${provider.label} returned an empty response. Check ${provider.modelEnv} and provider compatibility.`;
      addAiProviderFailureStep(provider, startedAt, message, undefined, { endpoint, status: response.status, statusText: response.statusText });
      throw new ServiceUnavailableException(message);
    }

    addFlowStep({
      step: "ai.provider.completed",
      layer: "ai",
      event: "completed",
      target: `${provider.label}.chat.completions`,
      durationMs: Date.now() - startedAt,
      description: `${provider.label} returned a successful AI response.`,
      data: {
        ...providerLogInfo,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        responseCharacters: content.length
      }
    });

    return {
      content,
      provider: provider.name,
      providerLabel: provider.label,
      model: provider.model,
      baseUrl: provider.baseUrl
    };
  }

  private async requestPuterChatCompletion(provider: AiProviderConfig, prompt: string, systemPrompt: string): Promise<AiProviderResponse> {
    const startedAt = Date.now();
    const endpoint = provider.baseUrl;
    const providerLogInfo = toProviderLogInfo(provider);
    addFlowStep({
      step: "ai.provider.request",
      layer: "ai",
      event: "enter",
      target: `${provider.label}.ai.chat`,
      description: `Calling ${provider.label} AI chat runtime.`,
      data: { ...providerLogInfo, endpoint }
    });

    try {
      const init = await this.loadPuterInit();
      const puter = init(provider.authToken);
      if (typeof puter.ai?.chat !== "function") {
        throw new Error("Puter runtime did not expose puter.ai.chat.");
      }

      const response = await puter.ai.chat([
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ], {
        model: provider.model,
        temperature: 0.3
      });
      const content = extractPuterContent(response);
      if (!content) {
        const message = `${provider.label} returned an empty response. Check ${provider.modelEnv} and Puter model compatibility.`;
        addAiProviderFailureStep(provider, startedAt, message, undefined, { endpoint });
        throw new ServiceUnavailableException(message);
      }

      addFlowStep({
        step: "ai.provider.completed",
        layer: "ai",
        event: "completed",
        target: `${provider.label}.ai.chat`,
        durationMs: Date.now() - startedAt,
        description: `${provider.label} returned a successful AI response.`,
        data: {
          ...providerLogInfo,
          endpoint,
          responseCharacters: content.length
        }
      });

      return {
        content,
        provider: provider.name,
        providerLabel: provider.label,
        model: provider.model,
        baseUrl: provider.baseUrl
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message = `${provider.label} runtime request failed: ${error instanceof Error ? error.message : "unknown runtime error"}.`;
      addAiProviderFailureStep(provider, startedAt, message, error, { endpoint });
      throw new ServiceUnavailableException(message);
    }
  }

  private async getPuterBudgetDecision(provider: AiProviderConfig): Promise<{ allow: true } | { allow: false; reason: string }> {
    if (!this.getBooleanConfig("PUTER_USAGE_GUARD_ENABLED", true)) return { allow: true };

    const startedAt = Date.now();
    const maxUsedPercent = this.getNumberConfig("PUTER_USAGE_MAX_PERCENT", 80);
    const minRemaining = this.getOptionalNumberConfig("PUTER_USAGE_MIN_REMAINING");

    try {
      const summary = await this.getPuterUsageSummary(provider);
      const thresholdReasons: string[] = [];
      if (typeof summary.usedPercent === "number" && summary.usedPercent >= maxUsedPercent) {
        thresholdReasons.push(`used ${formatBudgetNumber(summary.usedPercent)}% of allowance, threshold is ${formatBudgetNumber(maxUsedPercent)}%`);
      }
      if (typeof minRemaining === "number" && typeof summary.remaining === "number" && summary.remaining <= minRemaining) {
        thresholdReasons.push(`remaining allowance ${formatBudgetNumber(summary.remaining)} is at or below threshold ${formatBudgetNumber(minRemaining)}`);
      }

      if (thresholdReasons.length) {
        const reason = `Puter usage threshold reached: ${thresholdReasons.join("; ")}.`;
        addFlowStep({
          step: "ai.provider.budget.skipped",
          layer: "ai",
          event: "select",
          target: `${provider.label}.usage.guard`,
          durationMs: Date.now() - startedAt,
          description: "Skipping Puter because its monthly usage threshold has been reached.",
          data: {
            ...toProviderLogInfo(provider),
            ...summary,
            maxUsedPercent,
            minRemaining
          }
        });
        return { allow: false, reason };
      }

      addFlowStep({
        step: "ai.provider.budget.approved",
        layer: "ai",
        event: "completed",
        target: `${provider.label}.usage.guard`,
        durationMs: Date.now() - startedAt,
        description: "Puter monthly usage is under the configured threshold.",
        data: {
          ...toProviderLogInfo(provider),
          ...summary,
          maxUsedPercent,
          minRemaining
        }
      });
      return { allow: true };
    } catch (error) {
      const failOpen = this.getBooleanConfig("PUTER_USAGE_GUARD_FAIL_OPEN", false);
      const message = `Puter usage guard could not verify monthly usage: ${error instanceof Error ? error.message : "unknown usage error"}.`;
      addFlowStep({
        step: "ai.provider.budget.failed",
        layer: "ai",
        event: failOpen ? "completed" : "failed",
        target: `${provider.label}.usage.guard`,
        durationMs: Date.now() - startedAt,
        description: failOpen ? "Puter usage check failed, but fail-open mode allows the request." : "Puter usage check failed, so Puter is skipped to protect the budget.",
        data: {
          ...toProviderLogInfo(provider),
          failOpen
        },
        error: {
          name: error instanceof Error ? error.name : "PuterUsageGuardError",
          message
        }
      });
      return failOpen ? { allow: true } : { allow: false, reason: message };
    }
  }

  private async getPuterUsageSummary(provider: AiProviderConfig): Promise<PuterUsageSummary> {
    const authToken = provider.authToken?.trim() ?? "";
    const cacheSeconds = this.getNumberConfig("PUTER_USAGE_CACHE_SECONDS", 300);
    const now = Date.now();
    if (this.puterUsageCache && this.puterUsageCache.authToken === authToken && this.puterUsageCache.expiresAt > now) {
      return this.puterUsageCache.summary;
    }

    const init = await this.loadPuterInit();
    const puter = init(authToken);
    if (typeof puter.auth?.getMonthlyUsage !== "function") {
      throw new Error("Puter runtime did not expose puter.auth.getMonthlyUsage.");
    }

    const usage = await puter.auth.getMonthlyUsage();
    const usageRecord = readRecord(usage);
    const allowanceInfo = readRecord(usageRecord.allowanceInfo);
    const usageTotals = readRecord(usageRecord.usage);
    const allowance = readNumber(allowanceInfo.monthUsageAllowance);
    const remaining = readNumber(allowanceInfo.remaining);
    const explicitUsed = readNumber(usageTotals.total);
    const used = explicitUsed ?? (typeof allowance === "number" && typeof remaining === "number" ? Math.max(allowance - remaining, 0) : undefined);
    const usedPercent = typeof allowance === "number" && allowance > 0 && typeof used === "number" ? (used / allowance) * 100 : undefined;
    const summary: PuterUsageSummary = { allowance, remaining, used, usedPercent };

    this.puterUsageCache = {
      authToken,
      expiresAt: now + Math.max(cacheSeconds, 0) * 1000,
      summary
    };
    return summary;
  }

  private async loadPuterInit(): Promise<(authToken?: string) => PuterRuntime> {
    const puterModule = await import("@heyputer/puter.js/src/init.cjs") as unknown as PuterInitModule;
    if (typeof puterModule.init !== "function") {
      throw new Error("Puter init export was not found.");
    }
    return puterModule.init;
  }

  private getBooleanConfig(key: string, defaultValue: boolean) {
    const value = this.config.get<string>(key);
    if (typeof value !== "string" || !value.trim()) return defaultValue;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  private getNumberConfig(key: string, defaultValue: number) {
    return this.getOptionalNumberConfig(key) ?? defaultValue;
  }

  private getOptionalNumberConfig(key: string) {
    const value = this.config.get<string>(key);
    if (typeof value !== "string" || !value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true }
    });

    if (!membership) throw new ForbiddenException("Workspace access denied");
  }

  private async retrieveGroundingSources(userId: string, workspaceId: string, question: string, query = understandQuestion(question)): Promise<GroundingSource[]> {
    if (!hasActionableQuery(query)) return [];
    const shouldLoadTimeEntries = query.intents.has("time-summary") || query.intents.has("activity-summary");
    const timeRange = getTimeQueryRange(query);

    const [articles, tasks, tickets, notes, sqlSnippets, files, timeEntries] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, title: true, problem: true, rootCause: true, resolution: true, tags: true, references: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 250
      }),
      this.prisma.task.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, title: true, description: true, status: true, priority: true, labels: true, tags: true, checklist: true, dueDate: true, timeEstimate: true, actualTime: true, createdAt: true, customFields: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 250
      }),
      this.prisma.ticket.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, ticketNumber: true, customer: true, title: true, priority: true, severity: true, status: true, investigation: true, resolution: true, closureNotes: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 250
      }),
      this.prisma.note.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, title: true, content: true, tags: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 250
      }),
      this.prisma.sqlSnippet.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, title: true, description: true, query: true, databaseTags: true, folder: true, executionNotes: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 200
      }),
      this.prisma.fileAsset.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true, mimeType: true, size: true, entityType: true, entityId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200
      }),
      shouldLoadTimeEntries
        ? this.prisma.timeEntry.findMany({
          where: {
            userId,
            workspaceId,
            startedAt: {
              gte: timeRange.start,
              lt: timeRange.end
            }
          },
          select: {
            id: true,
            title: true,
            taskId: true,
            status: true,
            startedAt: true,
            durationSec: true,
            durationMin: true,
            task: { select: { id: true, title: true, status: true, priority: true } }
          },
          orderBy: { startedAt: "desc" },
          take: 250
        })
        : Promise.resolve([])
    ]);

    const timeContexts = buildTimeEntryContexts(timeEntries, timeRange);

    const contexts: RetrievalContext[] = [
      ...timeContexts,
      ...articles.map((article) => {
        const dateLabels = getRecordDateLabels(article);
        const facts: SourceFacts = {
          createdAt: article.createdAt?.toISOString().slice(0, 10),
          updatedAt: article.updatedAt.toISOString().slice(0, 10),
          description: article.problem,
          resolution: article.resolution,
          rootCause: article.rootCause ?? undefined,
          activityReason: summarizeRecordActivity(article)
        };
        return {
        type: "Knowledge Article" as const,
        id: article.id,
        title: article.title,
        text: [
          article.title,
          article.problem,
          article.rootCause,
          article.resolution,
          article.tags.join(" "),
          article.references.join(" "),
          ...dateLabels
        ].join("\n"),
        summary: [
          `Problem: ${article.problem}`,
          article.rootCause ? `Root cause: ${article.rootCause}` : "",
          `Resolution: ${article.resolution}`,
          dateLabels.length ? `Date context: ${dateLabels.join(", ")}` : "",
          article.tags.length ? `Tags: ${article.tags.join(", ")}` : "",
          article.references.length ? `References: ${article.references.join(", ")}` : ""
        ].filter(Boolean).join("\n"),
        aliases: sourceTypeAliases["Knowledge Article"],
        facts
        };
      }),
      ...tasks.map((task) => {
        const customFields = readRecord(task.customFields);
        const ticketLike = readString(customFields.workType) === "Ticket";
        const sourceType: GroundingSourceType = ticketLike ? "Ticket" : "Task";
        const dateLabels = getTaskDateLabels(task);
        const dueFacts = getDueFacts(task.dueDate);
        const workState = isClosedTaskStatus(task.status) ? "closed" as const : "open" as const;
        const checklistFacts = getChecklistFacts(task.checklist);
        const progressPercent = readNumber(customFields.progress) ?? (task.status === "DONE" ? 100 : 0);
        const startDate = readString(customFields.startDate);
        const notesText = taskNotesText(customFields.notes);
        const latestNote = taskLatestNote(customFields.notes);
        const facts: SourceFacts = {
          createdAt: task.createdAt.toISOString().slice(0, 10),
          status: formatWorkspaceLabel(task.status),
          priority: formatWorkspaceLabel(task.priority),
          progressPercent,
          checklistDone: checklistFacts.done,
          checklistTotal: checklistFacts.total,
          actualMinutes: task.actualTime,
          estimateMinutes: task.timeEstimate ?? undefined,
          startDate: startDate || undefined,
          dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : undefined,
          updatedAt: task.updatedAt.toISOString().slice(0, 10),
          ...dueFacts,
          workState,
          description: task.description ?? undefined,
          ticketNumber: readString(customFields.ticketNumber) || undefined,
          customer: readString(customFields.customer) || undefined,
          severity: readString(customFields.severity) || undefined,
          investigation: readString(customFields.investigation) || undefined,
          resolution: readString(customFields.resolution) || undefined,
          closureNotes: readString(customFields.closureNotes) || undefined,
          acceptanceCriteria: readString(customFields.acceptanceCriteria) || undefined,
          notes: notesText || undefined,
          latestNote: latestNote?.body,
          latestNoteAt: latestNote?.createdAt,
          activityReason: summarizeRecordActivity(task)
        };
        const ticketParts = [
          labeledValue("Ticket number", readString(customFields.ticketNumber)),
          labeledValue("Customer", readString(customFields.customer)),
          labeledValue("Severity", readString(customFields.severity)),
          labeledValue("Investigation", readString(customFields.investigation)),
          labeledValue("Resolution", readString(customFields.resolution)),
          labeledValue("Closure notes", readString(customFields.closureNotes)),
          labeledValue("Acceptance criteria", readString(customFields.acceptanceCriteria)),
          labeledValue("Latest task note", latestNote?.body ?? ""),
          labeledValue("Task notes", taskNotesText(customFields.notes))
        ].filter(Boolean);
        return {
          type: sourceType,
          id: task.id,
          title: ticketLike && readString(customFields.ticketNumber) ? `${readString(customFields.ticketNumber)} ${task.title}` : task.title,
          text: [
            task.title,
            task.description ?? "",
            task.status,
            task.priority,
            `progress ${progressPercent}%`,
            `checklist ${checklistFacts.done}/${checklistFacts.total}`,
            typeof task.actualTime === "number" ? `actual time ${task.actualTime} minutes` : "",
            typeof task.timeEstimate === "number" ? `estimate ${task.timeEstimate} minutes` : "",
            startDate ? `start ${startDate}` : "",
            task.dueDate ? `due ${task.dueDate.toISOString().slice(0, 10)}` : "",
            ...dateLabels,
            task.labels.join(" "),
            task.tags.join(" "),
            ...ticketParts
          ].join("\n"),
          summary: [
            buildAttentionLine(facts),
            `Status: ${facts.status}; Priority: ${facts.priority}${facts.dueDate ? `; Due: ${facts.dueDate}` : ""}`,
            `Progress: ${progressPercent}%; Checklist: ${checklistFacts.done}/${checklistFacts.total}; Time spent: ${formatMinutes(task.actualTime)}${typeof task.timeEstimate === "number" ? ` of ${formatMinutes(task.timeEstimate)} estimated` : ""}`,
            startDate ? `Start date: ${startDate}` : "",
            `Last updated: ${facts.updatedAt}`,
            latestNote?.body ? `Latest note: ${latestNote.body}${latestNote.createdAt ? ` (${latestNote.createdAt})` : ""}` : "",
            buildDueLine(facts),
            dateLabels.length ? `Date context: ${dateLabels.join(", ")}` : "",
            task.description ? `Description: ${task.description}` : "",
            ticketParts.length ? `Ticket fields: ${ticketParts.join(" | ")}` : "",
            task.tags.length ? `Tags: ${task.tags.join(", ")}` : ""
          ].filter(Boolean).join("\n"),
          aliases: [...sourceTypeAliases[sourceType], ...getTaskStatusAliases(task.status)],
          workState,
          facts
        };
      }),
      ...tickets.map((ticket) => {
        const dateLabels = getRecordDateLabels(ticket);
        const workState = isClosedTicketStatus(ticket.status) ? "closed" as const : "open" as const;
        const facts: SourceFacts = {
          createdAt: ticket.createdAt.toISOString().slice(0, 10),
          updatedAt: ticket.updatedAt.toISOString().slice(0, 10),
          status: formatWorkspaceLabel(ticket.status),
          priority: formatWorkspaceLabel(ticket.priority),
          workState,
          ticketNumber: ticket.ticketNumber,
          customer: ticket.customer ?? undefined,
          severity: formatWorkspaceLabel(ticket.severity),
          investigation: ticket.investigation ?? undefined,
          resolution: ticket.resolution ?? undefined,
          closureNotes: ticket.closureNotes ?? undefined,
          activityReason: summarizeRecordActivity(ticket)
        };
        return {
        type: "Ticket" as const,
        id: ticket.id,
        title: `${ticket.ticketNumber} ${ticket.title}`,
        text: [
          ticket.ticketNumber,
          ticket.title,
          ticket.customer ?? "",
          ticket.priority,
          ticket.severity,
          ticket.status,
          ticket.investigation ?? "",
          ticket.resolution ?? "",
          ticket.closureNotes ?? "",
          ...dateLabels
        ].join("\n"),
        summary: [
          buildAttentionLine(facts),
          `Ticket: ${ticket.ticketNumber}; Status: ${facts.status}; Priority: ${facts.priority}; Severity: ${facts.severity}`,
          ticket.customer ? `Customer: ${ticket.customer}` : "",
          ticket.investigation ? `Investigation: ${ticket.investigation}` : "",
          ticket.resolution ? `Resolution: ${ticket.resolution}` : "",
          ticket.closureNotes ? `Closure notes: ${ticket.closureNotes}` : "",
          dateLabels.length ? `Date context: ${dateLabels.join(", ")}` : ""
        ].filter(Boolean).join("\n"),
        aliases: [...sourceTypeAliases.Ticket, ...getTicketStatusAliases(ticket.status)],
        workState,
        facts
        };
      }),
      ...notes.map((note) => {
        const dateLabels = getRecordDateLabels(note);
        const facts: SourceFacts = {
          createdAt: note.createdAt?.toISOString().slice(0, 10),
          updatedAt: note.updatedAt?.toISOString().slice(0, 10),
          description: truncateText(note.content, 280),
          activityReason: summarizeRecordActivity(note)
        };
        return {
        type: "Note" as const,
        id: note.id,
        title: note.title,
        text: [note.title, note.content, note.tags.join(" "), ...dateLabels].join("\n"),
        summary: [`Content: ${note.content}`, dateLabels.length ? `Date context: ${dateLabels.join(", ")}` : "", note.tags.length ? `Tags: ${note.tags.join(", ")}` : ""].filter(Boolean).join("\n"),
        aliases: sourceTypeAliases.Note,
        facts
        };
      }),
      ...sqlSnippets.map((snippet) => {
        const dateLabels = getRecordDateLabels(snippet);
        const facts: SourceFacts = {
          createdAt: snippet.createdAt?.toISOString().slice(0, 10),
          updatedAt: snippet.updatedAt?.toISOString().slice(0, 10),
          description: snippet.description ?? snippet.executionNotes ?? undefined,
          activityReason: summarizeRecordActivity(snippet)
        };
        return {
        type: "SQL Snippet" as const,
        id: snippet.id,
        title: snippet.title,
        text: [
          snippet.title,
          snippet.description ?? "",
          snippet.query,
          snippet.databaseTags.join(" "),
          snippet.folder ?? "",
          snippet.executionNotes ?? "",
          ...dateLabels
        ].join("\n"),
        summary: [
          snippet.description ? `Description: ${snippet.description}` : "",
          snippet.folder ? `Folder: ${snippet.folder}` : "",
          snippet.executionNotes ? `Execution notes: ${snippet.executionNotes}` : "",
          dateLabels.length ? `Date context: ${dateLabels.join(", ")}` : "",
          `SQL: ${snippet.query}`
        ].filter(Boolean).join("\n"),
        aliases: sourceTypeAliases["SQL Snippet"],
        facts
        };
      }),
      ...files.map((file) => {
        const dateLabels = getRecordDateLabels(file);
        const facts: SourceFacts = {
          createdAt: file.createdAt?.toISOString().slice(0, 10),
          description: `${file.mimeType}; ${formatBytes(file.size)}${file.entityType ? `; linked to ${file.entityType}` : ""}`,
          activityReason: summarizeRecordActivity(file)
        };
        return {
        type: "File" as const,
        id: file.id,
        title: file.name,
        text: [file.name, file.mimeType, file.entityType ?? "", file.entityId ?? "", ...dateLabels].join("\n"),
        summary: [
          `File metadata only: ${file.name}; type ${file.mimeType}; size ${formatBytes(file.size)}; linked to ${file.entityType ?? "workspace"}${file.entityId ? ` ${file.entityId}` : ""}.`,
          dateLabels.length ? `Date context: ${dateLabels.join(", ")}` : ""
        ].filter(Boolean).join("\n"),
        aliases: sourceTypeAliases.File,
        facts
        };
      })
    ];

    const indexedContexts = buildWorkspaceSearchIndex(contexts);
    addFlowStep({
      step: "ai.retrieval.indexed",
      layer: "ai",
      event: "completed",
      target: "Workspace search index",
      description: "Indexed workspace records into normalized title/content tokens before semantic retrieval.",
      data: {
        documentCount: indexedContexts.length,
        quotedPhrases: query.quotedPhrases,
        intents: Array.from(query.intents),
        sourceTypeHints: Array.from(query.sourceTypeHints),
        temporalHints: Array.from(query.temporalHints)
      }
    });

    const scoredContexts = indexedContexts
      .map((context) => ({ ...context, score: scoreContext(context, query), contentScore: scoreContentMatch(context, query) }))
      .filter((context) => context.score >= 3 && shouldKeepContextForQuery(context, query));
    const narrowedContexts = narrowContextsForIntent(scoredContexts, query);

    const sourceLimit = query.intents.has("activity-summary") ? 14 : 10;
    return narrowedContexts
      .sort((left, right) => right.score - left.score)
      .slice(0, sourceLimit)
      .map((context, index) => ({
        sourceId: `S${index + 1}`,
        type: context.type,
        id: context.id,
        title: context.title,
        summary: truncateText(context.summary, 1200),
        score: context.score,
        facts: context.facts
      }));
  }
}

function isConfiguredProvider(provider: AiProviderConfig) {
  return isConfiguredSecret(provider.kind === "puter" ? provider.authToken : provider.apiKey);
}

function isConfiguredSecret(secret?: string) {
  if (!secret) return false;
  const normalized = secret.trim().toLowerCase();
  if (!normalized) return false;
  return ![
    "sk-abcdef1234567890abcdef1234567890abcdef12",
    "replace-with-openai-key",
    "your-openai-api-key",
    "replace-with-groq-key",
    "your-groq-api-key",
    "replace-with-puter-auth-token",
    "your-puter-auth-token"
  ].includes(normalized)
    && !normalized.includes("example")
    && !normalized.includes("dummy")
    && !normalized.includes("placeholder");
}

function parseProviderJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildProviderFailureMessage(provider: AiProviderConfig, status: number, statusText: string, payload: unknown, responseText: string) {
  const providerMessage = extractProviderMessage(payload) ?? responseText.slice(0, 240);
  const statusLabel = `${status}${statusText ? ` ${statusText}` : ""}`;
  const hint = providerHint(provider, status);
  return `${provider.label} rejected the request (${statusLabel}). ${hint}${providerMessage ? ` Provider message: ${providerMessage}` : ""}`;
}

function extractProviderMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  const message = record.message;
  return typeof message === "string" ? message : null;
}

function extractPuterContent(response: unknown): string | null {
  const directContent = extractTextContent(response);
  if (directContent) return directContent;

  const responseRecord = readRecord(response);
  const messageContent = extractTextContent(readRecord(responseRecord.message).content);
  if (messageContent) return messageContent;

  const choices = Array.isArray(responseRecord.choices) ? responseRecord.choices : [];
  const firstChoice = readRecord(choices[0]);
  const choiceContent = extractTextContent(readRecord(firstChoice.message).content) ?? extractTextContent(firstChoice.text);
  return choiceContent || null;
}

function extractTextContent(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const text = value.map(extractTextContent).filter(Boolean).join("\n").trim();
    return text || null;
  }
  if (!value || typeof value !== "object") return null;
  const record = readRecord(value);
  return extractTextContent(record.text) ?? extractTextContent(record.content);
}

function providerHint(provider: AiProviderConfig, status: number) {
  if (status === 401 || status === 403) return `Check ${provider.apiKeyEnv} and provider permissions.`;
  if (status === 404) return `Check ${provider.modelEnv} and ${provider.baseUrlEnv}.`;
  if (status === 429) return "The provider rate limit or quota was reached.";
  if (status >= 500) return "The provider is unavailable or returned a server error.";
  return `Check ${provider.baseUrlEnv}, ${provider.modelEnv}, and provider request compatibility.`;
}

function formatBudgetNumber(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function toProviderLogInfo(provider: AiProviderConfig) {
  return {
    provider: provider.name,
    providerKind: provider.kind,
    providerLabel: provider.label,
    model: provider.model,
    baseUrl: provider.baseUrl,
    apiKeyEnv: provider.apiKeyEnv,
    modelEnv: provider.modelEnv,
    baseUrlEnv: provider.baseUrlEnv
  };
}

function addAiProviderFailureStep(provider: AiProviderConfig, startedAt: number, message: string, error?: unknown, data?: Record<string, unknown>) {
  addFlowStep({
    step: "ai.provider.failed",
    layer: "ai",
    event: "failed",
    target: provider.kind === "puter" ? `${provider.label}.ai.chat` : `${provider.label}.chat.completions`,
    durationMs: Date.now() - startedAt,
    description: `${provider.label} did not return a usable AI response.`,
    data: {
      ...toProviderLogInfo(provider),
      ...data
    },
    error: {
      name: error instanceof Error ? error.name : "ServiceUnavailableException",
      message
    }
  });
}

const genericQuestionTerms = new Set([
  "a",
  "about",
  "again",
  "all",
  "any",
  "an",
  "are",
  "as",
  "at",
  "be",
  "been",
  "can",
  "could",
  "detail",
  "details",
  "do",
  "does",
  "find",
  "for",
  "from",
  "get",
  "give",
  "have",
  "has",
  "help",
  "how",
  "i",
  "in",
  "info",
  "information",
  "is",
  "it",
  "list",
  "know",
  "made",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "please",
  "record",
  "records",
  "related",
  "search",
  "show",
  "solve",
  "solved",
  "solution",
  "task",
  "tasks",
  "ticket",
  "tickets",
  "that",
  "the",
  "there",
  "this",
  "those",
  "to",
  "topic",
  "use",
  "what",
  "when",
  "where",
  "which",
  "with"
]);

const sourceTypeAliases: Record<GroundingSourceType, string[]> = {
  "Knowledge Article": ["article", "articles", "knowledge", "knowledge base", "kb", "documentation", "docs", "doc", "runbook", "playbook", "rca", "root cause", "resolution"],
  Task: ["task", "tasks", "item", "items", "work item", "work items", "action", "next action", "assignment"],
  Ticket: ["ticket", "tickets", "case", "cases", "support", "support case", "customer issue", "incident", "item", "items", "work item", "work items", "severity", "investigation"],
  Note: ["note", "notes", "memo", "scratchpad", "meeting note", "decision", "journal"],
  "SQL Snippet": ["sql", "query", "queries", "database", "db", "snippet", "script", "statement"],
  File: ["file", "files", "attachment", "attachments", "document", "pdf", "spreadsheet", "image", "log", "upload"],
  "Time Entry": ["time", "tracked time", "focus", "focus time", "timer", "timers", "time entry", "time entries", "worked", "spent"]
};

const sourceTypeKeywordMap: Array<{ terms: string[]; types: GroundingSourceType[] }> = [
  { terms: [...sourceTypeAliases.Task, "todo", "todos", "to do", "open item", "open items"], types: ["Task"] },
  { terms: [...sourceTypeAliases.Ticket, "open item", "open items"], types: ["Ticket"] },
  { terms: sourceTypeAliases["Knowledge Article"], types: ["Knowledge Article"] },
  { terms: sourceTypeAliases.Note, types: ["Note"] },
  { terms: sourceTypeAliases["SQL Snippet"], types: ["SQL Snippet"] },
  { terms: sourceTypeAliases.File, types: ["File"] },
  { terms: sourceTypeAliases["Time Entry"], types: ["Time Entry"] }
];

const semanticAliasGroups = [
  ["bug", "bugs", "issue", "issues", "error", "errors", "failure", "failures", "failed", "failing", "exception", "incident", "incidents", "outage", "problem", "problems"],
  ["fix", "fixes", "resolve", "resolved", "resolution", "solution", "workaround", "mitigation", "rca", "root cause", "root-cause", "rootcause"],
  ["block", "blocked", "blocker", "blockers", "stuck", "pending", "waiting", "hold", "dependency", "dependencies"],
  ["done", "complete", "completed", "closed", "finished", "resolved"],
  ["customer", "customers", "client", "clients", "account", "accounts", "user", "users"],
  ["login", "signin", "sign-in", "sign in", "auth", "authentication", "password", "session"],
  ["slow", "slowness", "latency", "performance", "timeout", "timeouts", "timedout", "timed-out"],
  ["payment", "payments", "billing", "invoice", "invoices", "refund", "refunds", "settlement", "settlements"],
  ["email", "mail", "notification", "notifications", "reminder", "reminders"],
  ["upload", "uploads", "download", "downloads", "storage", "r2", "cloudflare"],
  ["api", "endpoint", "request", "response", "controller", "service", "flow"],
  ["priority", "prioritize", "urgent", "important", "critical", "high"],
  ["progress", "status", "update", "updates", "made", "worked", "work done", "completed", "checklist", "notes"],
  ["time", "times", "tracked time", "focus", "focus time", "timer", "timers", "worked", "spent", "duration"],
  ["open", "active", "ongoing", "todo", "to do", "in progress", "pending", "review", "backlog", "unresolved"],
  ["today", "daily", "day"],
  ["week", "weekly", "this week"],
  ["month", "monthly", "this month"],
  ["recent", "recently", "latest", "updated", "created"]
];

const semanticAliasMap = buildAliasMap(semanticAliasGroups);

function understandQuestion(question: string): QueryUnderstanding {
  const normalizedQuestion = normalizeSearchText(question);
  const rawTokens = tokenizeSearchText(normalizedQuestion);
  const sourceTypeHints = detectSourceTypeHints(normalizedQuestion, rawTokens);
  const temporalHints = detectTemporalHints(normalizedQuestion, rawTokens);
  const intents = detectQueryIntents(normalizedQuestion, rawTokens, sourceTypeHints);
  const quotedPhrases = extractQuotedPhrases(question);
  const terms = new Set<string>();
  const contentTerms = new Set<string>();

  for (const token of rawTokens) {
    const normalizedToken = normalizeQueryToken(token);
    if (!normalizedToken || normalizedToken.length < 2) continue;
    if (isSourceTypeOnlyTerm(normalizedToken)) continue;
    if (genericQuestionTerms.has(normalizedToken) || genericQuestionTerms.has(singularizeTerm(normalizedToken))) continue;
    addTermWithVariants(terms, normalizedToken);
    if (!isTemporalQueryTerm(normalizedToken)) addTermWithVariants(contentTerms, normalizedToken);
    for (const alias of semanticAliasMap.get(normalizedToken) ?? []) {
      addTermWithVariants(terms, alias);
      if (!isTemporalQueryTerm(alias)) addTermWithVariants(contentTerms, alias);
    }
  }

  for (const hint of temporalHints) {
    for (const term of temporalHintTerms(hint)) addTermWithVariants(terms, term);
  }

  const phraseTerms = buildPhraseTerms(rawTokens);
  return {
    original: question,
    normalizedQuestion,
    intents,
    quotedPhrases,
    contentTerms: Array.from(contentTerms).slice(0, 32),
    terms: Array.from(terms).slice(0, 40),
    phraseTerms,
    sourceTypeHints,
    temporalHints
  };
}

function hasActionableQuery(query: QueryUnderstanding) {
  return query.intents.size > 0 || query.terms.length > 0 || query.sourceTypeHints.size > 0 || query.temporalHints.size > 0 || query.phraseTerms.length > 0 || query.quotedPhrases.length > 0;
}

type RetrievedTimeEntry = {
  id: string;
  title: string;
  taskId: string | null;
  status: string;
  startedAt: Date;
  durationSec: number;
  durationMin: number;
  task: { id: string; title: string; status: string; priority: string } | null;
};

function buildTimeEntryContexts(timeEntries: RetrievedTimeEntry[], range: TimeQueryRange): RetrievalContext[] {
  const entriesWithSeconds = timeEntries.map((entry) => ({
    entry,
    seconds: entry.durationSec + (entry.status === "RUNNING" ? currentRunSeconds(entry.startedAt) : 0)
  }));
  const totalSeconds = entriesWithSeconds.reduce((total, item) => total + item.seconds, 0);
  const summaryFacts: SourceFacts = {
    durationSec: totalSeconds,
    durationMin: Math.floor(totalSeconds / 60),
    timeEntryCount: timeEntries.length,
    timeRangeLabel: range.label
  };
  const summaryContext: RetrievalContext = {
    type: "Time Entry",
    id: `time-summary-${range.key}`,
    title: `Time worked ${range.label}`,
    text: [
      "time worked tracked focus timer duration",
      range.label,
      `${formatSecondsDuration(totalSeconds)} total`,
      `${timeEntries.length} entries`,
      ...entriesWithSeconds.map(({ entry, seconds }) => `${entry.task?.title ?? entry.title} ${formatSecondsDuration(seconds)} ${entry.status}`)
    ].join("\n"),
    summary: [
      `Total tracked time ${range.label}: ${formatSecondsDuration(totalSeconds)}.`,
      `Entries counted: ${timeEntries.length}.`,
      timeEntries.length ? `Tasks/sessions: ${entriesWithSeconds.map(({ entry, seconds }) => `${entry.task?.title ?? entry.title} (${formatSecondsDuration(seconds)})`).join("; ")}` : "No saved time entries found for this period."
    ].join("\n"),
    aliases: sourceTypeAliases["Time Entry"],
    facts: summaryFacts
  };

  const grouped = new Map<string, { title: string; taskId?: string; seconds: number; count: number; statuses: Set<string> }>();
  for (const { entry, seconds } of entriesWithSeconds) {
    const key = entry.taskId ?? `session:${entry.title}`;
    const current = grouped.get(key) ?? { title: entry.task?.title ?? entry.title, taskId: entry.taskId ?? undefined, seconds: 0, count: 0, statuses: new Set<string>() };
    current.seconds += seconds;
    current.count += 1;
    current.statuses.add(entry.status);
    grouped.set(key, current);
  }

  const taskContexts = Array.from(grouped.entries())
    .sort((left, right) => right[1].seconds - left[1].seconds)
    .slice(0, 8)
    .map(([key, group]) => ({
      type: "Time Entry" as const,
      id: `time-task-${key}`,
      title: group.title,
      text: [
        "time worked tracked focus timer duration task",
        group.title,
        range.label,
        `${formatSecondsDuration(group.seconds)} tracked`,
        `${group.count} entries`,
        Array.from(group.statuses).join(" ")
      ].join("\n"),
      summary: [
        `Tracked time ${range.label}: ${formatSecondsDuration(group.seconds)}.`,
        `Entries counted: ${group.count}.`,
        `Timer statuses: ${Array.from(group.statuses).join(", ")}.`
      ].join("\n"),
      aliases: sourceTypeAliases["Time Entry"],
      facts: {
        durationSec: group.seconds,
        durationMin: Math.floor(group.seconds / 60),
        timeEntryCount: group.count,
        timeRangeLabel: range.label,
        taskTitle: group.title,
        taskId: group.taskId
      }
    }));

  return [summaryContext, ...taskContexts];
}

function buildWorkspaceSearchIndex(contexts: RetrievalContext[]): IndexedRetrievalContext[] {
  return contexts.map((context) => {
    const normalizedTitle = normalizeSearchText(context.title);
    const normalizedContentText = normalizeSearchText([context.title, context.text].join("\n"));
    const normalizedSearchText = normalizeSearchText([context.title, context.text, context.type, ...context.aliases].join("\n"));
    return {
      ...context,
      normalizedTitle,
      normalizedContentText,
      normalizedSearchText,
      searchTokens: new Set(tokenizeSearchText(normalizedSearchText).map((token) => normalizeQueryToken(token)).filter(Boolean)),
      contentTokens: new Set(tokenizeSearchText(normalizedContentText).map((token) => normalizeQueryToken(token)).filter(Boolean))
    };
  });
}

function scoreContext(context: IndexedRetrievalContext, query: QueryUnderstanding) {
  let score = 0;
  let evidenceScore = 0;
  let matchedTerms = 0;

  const priorityWorkScore = scorePriorityWorkContext(context, query);
  if (priorityWorkScore > 0) {
    score += priorityWorkScore;
    evidenceScore += priorityWorkScore;
  }

  const quotedPhraseScore = scoreQuotedPhrases(context, query);
  if (quotedPhraseScore > 0) {
    score += quotedPhraseScore;
    evidenceScore += quotedPhraseScore;
  }

  for (const term of query.terms) {
    const normalizedTerm = normalizeSearchText(term);
    if (!normalizedTerm) continue;
    const termScore = scoreTerm(normalizedTerm, context.normalizedTitle, context.normalizedSearchText, context.searchTokens);
    if (termScore > 0) {
      matchedTerms += 1;
      score += termScore;
      evidenceScore += termScore;
    }
  }

  for (const phrase of query.phraseTerms) {
    const normalizedPhrase = normalizeSearchText(phrase);
    if (normalizedPhrase.length >= 5 && context.normalizedSearchText.includes(normalizedPhrase)) {
      score += 6;
      evidenceScore += 6;
    }
  }

  if (query.normalizedQuestion.length >= 8 && context.normalizedSearchText.includes(query.normalizedQuestion)) {
    score += 8;
    evidenceScore += 8;
  }

  const temporalScore = scoreTemporalContext(context.normalizedSearchText, query.temporalHints);
  if (temporalScore > 0) {
    score += temporalScore;
    evidenceScore += temporalScore;
  }

  const activityScore = scoreActivitySummaryContext(context, query);
  if (activityScore > 0) {
    score += activityScore;
    evidenceScore += activityScore;
  }

  if (query.sourceTypeHints.has(context.type)) {
    score += evidenceScore > 0 ? 3 : 1;
  }

  if (matchedTerms >= 2) score += 3;
  return evidenceScore > 0 ? score : Math.min(score, 2);
}

function shouldKeepContextForQuery(context: RetrievalContext & { contentScore?: number }, query: QueryUnderstanding) {
  if (query.intents.has("activity-summary")) {
    if (context.type === "Time Entry") return true;
    if (query.temporalHints.size > 0) return contextMatchesActivityPeriod(getContextSearchText(context), query);
    return contextMatchesActivityPeriod(getContextSearchText(context), query) || Boolean(context.facts?.activityReason);
  }
  if (query.intents.has("time-summary")) return context.type === "Time Entry";
  if (hasOpenWorkIntent(query) && context.workState === "closed") return false;
  if (query.intents.has("priority-work") && context.type !== "Task" && context.type !== "Ticket") return false;
  if (query.sourceTypeHints.size === 0) return true;
  if (query.sourceTypeHints.has(context.type)) return true;
  return (context.contentScore ?? 0) >= 4;
}

function narrowContextsForIntent<T extends IndexedRetrievalContext & { score: number; contentScore?: number }>(contexts: T[], query: QueryUnderstanding) {
  const exactNamedContexts = findQuotedTitleMatches(contexts, query);
  if (exactNamedContexts.length > 0 && (query.intents.has("task-progress") || query.sourceTypeHints.size > 0)) {
    const matchedIds = new Set(exactNamedContexts.map((context) => `${context.type}:${context.id}`));
    const directlyRelevant = contexts.filter((context) => matchedIds.has(`${context.type}:${context.id}`));
    if (directlyRelevant.length > 0) return directlyRelevant;
  }

  if (!query.intents.has("task-progress")) return contexts;
  const workContexts = contexts.filter((context) => context.type === "Task" || context.type === "Ticket");
  const best = workContexts.sort((left, right) => right.score - left.score)[0];
  if (!best || best.score < 8) return contexts;
  const minimumStrongScore = Math.max(8, best.score - 2);
  return contexts.filter((context) => {
    if (context.id === best.id) return true;
    if ((context.type === "Task" || context.type === "Ticket") && context.score >= minimumStrongScore) return true;
    return (context.contentScore ?? 0) >= minimumStrongScore;
  });
}

function findQuotedTitleMatches<T extends IndexedRetrievalContext>(contexts: T[], query: QueryUnderstanding) {
  if (query.quotedPhrases.length === 0) return [];
  return contexts.filter((context) => query.quotedPhrases.some((phrase) => isQuotedTitleMatch(context, phrase)));
}

function isQuotedTitleMatch(context: IndexedRetrievalContext, phrase: string) {
  if (!phrase) return false;
  if (context.normalizedTitle === phrase) return true;
  return context.normalizedTitle.includes(phrase) || phrase.includes(context.normalizedTitle);
}

function hasOpenWorkIntent(query: QueryUnderstanding) {
  return query.intents.has("open-work")
    || query.intents.has("priority-work")
    || query.normalizedQuestion.includes("open")
    || query.normalizedQuestion.includes("ongoing")
    || query.normalizedQuestion.includes("active")
    || query.normalizedQuestion.includes("unresolved")
    || query.normalizedQuestion.includes("not done");
}

function scoreContentMatch(context: IndexedRetrievalContext, query: QueryUnderstanding) {
  const quotedScore = scoreQuotedPhrases(context, query);
  if (query.contentTerms.length === 0) return quotedScore;
  return quotedScore + query.contentTerms.reduce((total, term) => total + scoreTerm(term, context.normalizedTitle, context.normalizedContentText, context.contentTokens), 0);
}

function scoreTerm(term: string, title: string, text: string, textTokens: Set<string>) {
  let score = 0;
  if (title.includes(term)) score += 5;
  if (textTokens.has(term)) score += 3;
  else if (text.includes(term)) score += 1;
  else if (isFuzzyTokenMatch(term, textTokens)) score += 1;
  return score;
}

function scorePriorityWorkContext(context: IndexedRetrievalContext, query: QueryUnderstanding) {
  if (!query.intents.has("priority-work")) return 0;
  if (context.workState !== "open" || (context.type !== "Task" && context.type !== "Ticket")) return 0;
  const facts = context.facts;
  let score = 8;
  if (facts?.isOverdue) score += 14;
  if (facts?.isDueToday) score += 12;
  if (facts?.isDueThisWeek) score += 6;
  if (facts?.priority === "Urgent") score += 16;
  else if (facts?.priority === "High") score += 14;
  else if (facts?.priority === "Medium") score += 8;
  else if (facts?.priority === "Low") score += 4;
  if (facts?.status === "In Progress") score += 5;
  if (facts?.status === "Pending") score += 3;
  return score;
}

function scoreQuotedPhrases(context: IndexedRetrievalContext, query: QueryUnderstanding) {
  return query.quotedPhrases.reduce((score, phrase) => {
    if (!phrase) return score;
    if (context.normalizedTitle === phrase) return score + 45;
    if (context.normalizedTitle.includes(phrase) || phrase.includes(context.normalizedTitle)) return score + 28;
    if (context.normalizedContentText.includes(phrase)) return score + 12;
    return score;
  }, 0);
}

function scoreTemporalContext(text: string, temporalHints: Set<TemporalHint>) {
  let score = 0;
  if (temporalHints.has("today") && (text.includes("today") || text.includes(new Date().toISOString().slice(0, 10)))) score += 5;
  if (temporalHints.has("tomorrow") && text.includes("tomorrow")) score += 5;
  if (temporalHints.has("this-week") && text.includes("this week")) score += 5;
  if (temporalHints.has("this-month") && text.includes("this month")) score += 5;
  if (temporalHints.has("overdue") && (text.includes("overdue") || text.includes("past due"))) score += 6;
  if (temporalHints.has("recent") && (text.includes("recent") || text.includes("updated") || text.includes("created"))) score += 4;
  return score;
}

function scoreActivitySummaryContext(context: IndexedRetrievalContext, query: QueryUnderstanding) {
  if (!query.intents.has("activity-summary")) return 0;
  if (context.type === "Time Entry") return context.id.startsWith("time-summary") ? 18 : 14;
  if (contextMatchesActivityPeriod(context.normalizedSearchText, query)) return 10;
  if (context.facts?.activityReason) return 5;
  return 0;
}

function contextMatchesActivityPeriod(text: string, query: QueryUnderstanding) {
  const normalizedText = normalizeSearchText(text);
  if (query.temporalHints.has("today")) return normalizedText.includes("created today") || normalizedText.includes("updated today");
  if (query.temporalHints.has("this-week")) return normalizedText.includes("created this week") || normalizedText.includes("updated this week");
  if (query.temporalHints.has("this-month")) return normalizedText.includes("created this month") || normalizedText.includes("updated this month");
  if (query.temporalHints.has("recent")) return normalizedText.includes("created recently") || normalizedText.includes("updated recently");
  return normalizedText.includes("created this week") || normalizedText.includes("updated this week") || normalizedText.includes("created recently") || normalizedText.includes("updated recently");
}

function getContextSearchText(context: RetrievalContext & { normalizedSearchText?: string }) {
  return context.normalizedSearchText ?? [context.title, context.summary, context.text].join("\n");
}

function detectSourceTypeHints(normalizedQuestion: string, tokens: string[]) {
  const hints = new Set<GroundingSourceType>();
  const tokenSet = new Set(tokens.map((token) => normalizeQueryToken(token)));
  for (const mapping of sourceTypeKeywordMap) {
    if (mapping.terms.some((term) => matchesQueryTerm(normalizedQuestion, tokenSet, term))) {
      for (const type of mapping.types) hints.add(type);
    }
  }
  return hints;
}

function detectQueryIntents(normalizedQuestion: string, tokens: string[], sourceTypeHints: Set<GroundingSourceType>) {
  const intents = new Set<QueryIntent>();
  const tokenSet = new Set(tokens.map((token) => normalizeQueryToken(token)));
  const asksPriorityWork = ["priority", "prioritize", "urgent", "important", "critical", "high"].some((term) => tokenSet.has(term))
    || normalizedQuestion.includes("most important")
    || normalizedQuestion.includes("what should i work on")
    || normalizedQuestion.includes("what should i do")
    || normalizedQuestion.includes("next task")
    || normalizedQuestion.includes("next tasks");
  const asksLatestUpdate = normalizedQuestion.includes("last update")
    || normalizedQuestion.includes("latest update")
    || normalizedQuestion.includes("last updated")
    || normalizedQuestion.includes("latest note")
    || normalizedQuestion.includes("recent note")
    || ((tokenSet.has("last") || tokenSet.has("latest") || tokenSet.has("recent")) && ["update", "updates", "updated", "note", "notes", "progress"].some((term) => tokenSet.has(term)));
  const asksTimeSummary = normalizedQuestion.includes("how much time")
    || normalizedQuestion.includes("time did i work")
    || normalizedQuestion.includes("time have i worked")
    || normalizedQuestion.includes("time spent")
    || normalizedQuestion.includes("tracked time")
    || normalizedQuestion.includes("focus time")
    || (["time", "timer", "timers", "worked", "spent", "duration"].some((term) => tokenSet.has(term)) && (tokenSet.has("week") || tokenSet.has("today") || tokenSet.has("month") || tokenSet.has("worked") || tokenSet.has("spent")));
  const asksActivitySummary = !normalizedQuestion.includes("how much time")
    && (
      normalizedQuestion.includes("summarize")
      || normalizedQuestion.includes("summerize")
      || normalizedQuestion.includes("summary")
      || normalizedQuestion.includes("recap")
      || normalizedQuestion.includes("report")
      || normalizedQuestion.includes("what did i work")
      || normalizedQuestion.includes("what have i worked")
      || normalizedQuestion.includes("what i have worked")
      || normalizedQuestion.includes("what was worked")
      || normalizedQuestion.includes("worked on")
      || normalizedQuestion.includes("work done")
      || normalizedQuestion.includes("activity")
    )
    && (
      tokenSet.has("work")
      || tokenSet.has("worked")
      || tokenSet.has("task")
      || tokenSet.has("ticket")
      || tokenSet.has("time")
      || sourceTypeHints.size > 0
      || normalizedQuestion.includes("this week")
      || normalizedQuestion.includes("this month")
    );
  const asksProgress = ["progress", "update", "updates", "status", "worked", "completed", "checklist"].some((term) => tokenSet.has(term))
    || normalizedQuestion.includes("progress made")
    || normalizedQuestion.includes("work done")
    || normalizedQuestion.includes("work has been done")
    || normalizedQuestion.includes("has been done")
    || normalizedQuestion.includes("has been made")
    || normalizedQuestion.includes("what work has")
    || (tokenSet.has("done") && (sourceTypeHints.has("Task") || sourceTypeHints.has("Ticket")))
    || (tokenSet.has("work") && tokenSet.has("done"));
  const asksOpenWork = normalizedQuestion.includes("open item")
    || normalizedQuestion.includes("open work")
    || normalizedQuestion.includes("open task")
    || normalizedQuestion.includes("open ticket")
    || tokenSet.has("open")
    || tokenSet.has("active")
    || tokenSet.has("ongoing")
    || tokenSet.has("unresolved");
  if (asksPriorityWork && (sourceTypeHints.has("Task") || sourceTypeHints.has("Ticket") || normalizedQuestion.includes("work"))) {
    intents.add("priority-work");
    intents.add("open-work");
  }
  if (asksLatestUpdate) {
    intents.add("latest-update");
    intents.add("task-progress");
    intents.add("status-check");
  }
  if (asksActivitySummary) intents.add("activity-summary");
  if (asksTimeSummary && !asksActivitySummary) intents.add("time-summary");
  if (asksProgress && sourceTypeHints.has("Task")) intents.add("task-progress");
  if (asksProgress) intents.add("status-check");
  if (asksOpenWork) intents.add("open-work");
  if (normalizedQuestion.includes("root cause") || normalizedQuestion.includes("resolution") || normalizedQuestion.includes("solved")) intents.add("ticket-resolution");
  if (sourceTypeHints.has("Knowledge Article") || normalizedQuestion.includes("what do we know")) intents.add("knowledge-lookup");
  return intents;
}

function detectTemporalHints(normalizedQuestion: string, tokens: string[]) {
  const hints = new Set<TemporalHint>();
  const tokenSet = new Set(tokens.map((token) => normalizeQueryToken(token)));
  if (tokenSet.has("today") || tokenSet.has("daily")) hints.add("today");
  if (tokenSet.has("tomorrow")) hints.add("tomorrow");
  if (tokenSet.has("week") || tokenSet.has("weekly") || normalizedQuestion.includes("this week")) hints.add("this-week");
  if (tokenSet.has("month") || tokenSet.has("monthly") || normalizedQuestion.includes("this month")) hints.add("this-month");
  if (tokenSet.has("overdue") || normalizedQuestion.includes("past due") || tokenSet.has("late")) hints.add("overdue");
  if (tokenSet.has("recent") || tokenSet.has("recently") || tokenSet.has("latest")) hints.add("recent");
  return hints;
}

function temporalHintTerms(hint: TemporalHint) {
  const terms: Record<TemporalHint, string[]> = {
    today: ["today", "due today", "created today", "updated today"],
    tomorrow: ["tomorrow", "due tomorrow"],
    "this-week": ["week", "weekly", "this week", "due this week", "created this week", "updated this week"],
    "this-month": ["month", "monthly", "this month", "due this month", "created this month", "updated this month"],
    overdue: ["overdue", "past due", "late"],
    recent: ["recent", "recently", "latest", "updated recently", "created recently"]
  };
  return terms[hint];
}

function getTimeQueryRange(query: QueryUnderstanding): TimeQueryRange {
  const today = startOfDay(new Date());
  if (query.temporalHints.has("today")) {
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    return { key: "today", label: "today", start: today, end };
  }
  if (query.temporalHints.has("this-month")) {
    const month = getCurrentMonthRange(today);
    return { key: "this-month", label: "this month", ...month };
  }
  if (query.temporalHints.has("recent")) {
    const start = new Date(today);
    start.setDate(start.getDate() - 14);
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    return { key: "recent", label: "in the last 14 days", start, end };
  }
  const week = getCurrentWeekRange(today);
  return { key: "this-week", label: "this week", ...week };
}

function matchesQueryTerm(normalizedQuestion: string, tokenSet: Set<string>, value: string) {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return false;
  if (normalizedValue.includes(" ")) return normalizedQuestion.includes(normalizedValue);
  return tokenSet.has(normalizedValue) || tokenSet.has(singularizeTerm(normalizedValue));
}

function tokenizeSearchText(value: string) {
  return value.split(/\s+/).map((term) => term.trim()).filter(Boolean);
}

function normalizeQueryToken(value: string) {
  return normalizeSearchText(value).replace(/^[-_.]+|[-_.]+$/g, "");
}

function extractQuotedPhrases(value: string) {
  const phrases = new Set<string>();
  for (const match of value.matchAll(/["“”]([^"“”]{2,120})["“”]/g)) {
    const normalized = normalizeSearchText(match[1]);
    if (normalized.length >= 2) phrases.add(normalized);
  }
  return Array.from(phrases).slice(0, 8);
}

function isSourceTypeOnlyTerm(term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return sourceTypeKeywordMap.some((mapping) => mapping.terms.some((alias) => normalizeSearchText(alias) === normalizedTerm));
}

function isTemporalQueryTerm(term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return [
    "today",
    "daily",
    "day",
    "tomorrow",
    "week",
    "weekly",
    "this week",
    "month",
    "monthly",
    "this month",
    "overdue",
    "past due",
    "late",
    "recent",
    "recently",
    "latest",
    "updated",
    "created"
  ].includes(normalizedTerm);
}

function buildPhraseTerms(tokens: string[]) {
  const phrases = new Set<string>();
  const significantTokens = tokens.map((token) => normalizeQueryToken(token)).filter((token) => token.length >= 2);
  for (let index = 0; index < significantTokens.length; index += 1) {
    for (const size of [2, 3]) {
      const phrase = significantTokens.slice(index, index + size);
      if (phrase.length === size && phrase.some((term) => !genericQuestionTerms.has(term) && !isSourceTypeOnlyTerm(term))) {
        phrases.add(phrase.join(" "));
      }
    }
  }
  return Array.from(phrases).slice(0, 16);
}

function addTermWithVariants(terms: Set<string>, value: string) {
  const normalized = normalizeSearchText(value);
  if (!normalized || normalized.length < 2) return;
  terms.add(normalized);
  if (normalized.includes(" ")) return;

  const singular = singularizeTerm(normalized);
  terms.add(singular);
  const plural = pluralizeTerm(singular);
  if (plural.length <= 40) terms.add(plural);
}

function buildAliasMap(groups: string[][]) {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    const normalizedGroup = Array.from(new Set(group.map((term) => normalizeSearchText(term)).filter(Boolean)));
    for (const term of normalizedGroup) {
      map.set(term, normalizedGroup.filter((alias) => alias !== term));
      const singular = singularizeTerm(term);
      if (singular !== term && !map.has(singular)) {
        map.set(singular, normalizedGroup.filter((alias) => alias !== term));
      }
    }
  }
  return map;
}

function singularizeTerm(term: string) {
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 3 && term.endsWith("ses")) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) return term.slice(0, -1);
  return term;
}

function pluralizeTerm(term: string) {
  if (term.endsWith("y") && term.length > 2) return `${term.slice(0, -1)}ies`;
  if (term.endsWith("s")) return term;
  return `${term}s`;
}

function isFuzzyTokenMatch(term: string, textTokens: Set<string>) {
  if (term.length < 4 || /[^a-z]/.test(term)) return false;
  const maxDistance = term.length <= 5 ? 1 : 2;
  for (const token of textTokens) {
    if (token.length < 4 || /[^a-z]/.test(token)) continue;
    if (Math.abs(token.length - term.length) > maxDistance) continue;
    if (levenshteinDistance(term, token, maxDistance) <= maxDistance) return true;
  }
  return false;
}

function levenshteinDistance(left: string, right: string, maxDistance: number) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost
      );
      current[rightIndex] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maxDistance) return rowMinimum;
    previous = current;
  }
  return previous[right.length];
}

function buildTemplatedAnswer(query: QueryUnderstanding, sources: GroundingSource[]) {
  if (query.intents.has("time-summary")) return buildTimeSummaryAnswer(sources);
  if (query.intents.has("latest-update")) return buildLatestUpdateAnswer(sources);
  if (query.intents.has("task-progress")) return buildTaskProgressAnswer(sources);
  if (query.intents.has("priority-work")) return buildPriorityWorkAnswer(sources);
  if (query.intents.has("open-work")) return buildOpenWorkAnswer(sources);
  return null;
}

function buildTimeSummaryAnswer(sources: GroundingSource[]) {
  const summarySource = sources.find((source) => source.type === "Time Entry" && source.id.startsWith("time-summary"));
  if (!summarySource?.facts) return null;
  const taskSources = sources.filter((source) => source.type === "Time Entry" && !source.id.startsWith("time-summary") && source.facts);
  const totalSeconds = summarySource.facts.durationSec ?? 0;
  const rangeLabel = summarySource.facts.timeRangeLabel ?? "the selected period";

  return [
    "## Time Worked",
    `You worked ${formatSecondsDuration(totalSeconds)} ${rangeLabel}. [${summarySource.sourceId}]`,
    `- Entries counted: ${summarySource.facts.timeEntryCount ?? 0}. [${summarySource.sourceId}]`,
    "",
    taskSources.length ? "## Time By Task" : "",
    ...taskSources.map((source) => `- ${source.title}: ${formatSecondsDuration(source.facts?.durationSec ?? 0)} across ${source.facts?.timeEntryCount ?? 0} entr${source.facts?.timeEntryCount === 1 ? "y" : "ies"}. [${source.sourceId}]`),
    "",
    "## Note",
    totalSeconds > 0
      ? "This answer is based on saved time entries, not task estimate or task progress fields."
      : "No saved time entries were found for this period."
  ].filter(Boolean).join("\n");
}

function buildLatestUpdateAnswer(sources: GroundingSource[]) {
  const source = sources.find((item) => (item.type === "Task" || item.type === "Ticket") && item.facts);
  if (!source?.facts) return null;
  const facts = source.facts;
  const latestText = facts.latestNote ?? facts.notes;

  return [
    "## Latest Update",
    latestText
      ? `The latest recorded update on ${source.title} is: "${latestText}". [${source.sourceId}]`
      : `The record for ${source.title} was last updated${facts.updatedAt ? ` on ${facts.updatedAt}` : ""}, but there is no progress note text recorded. [${source.sourceId}]`,
    facts.latestNoteAt ? `- Note recorded: ${facts.latestNoteAt}. [${source.sourceId}]` : "",
    facts.updatedAt ? `- Record last updated: ${facts.updatedAt}. [${source.sourceId}]` : "",
    "",
    "## Current State",
    `- Status: ${facts.status ?? "Unknown"}. [${source.sourceId}]`,
    `- Priority: ${facts.priority ?? "Unknown"}. [${source.sourceId}]`,
    facts.dueDate ? `- Due: ${formatDueFact(facts)}. [${source.sourceId}]` : "",
    "",
    "## Helpful Next Step",
    latestText
      ? "- Use the latest note to decide the next unblocker or follow-up."
      : "- Add a progress note that captures what changed, who is waiting, and the next action."
  ].filter(Boolean).join("\n");
}

function buildPriorityWorkAnswer(sources: GroundingSource[]) {
  const workSources = sources.filter((source) => source.facts?.workState === "open" && (source.type === "Task" || source.type === "Ticket"));
  if (workSources.length === 0) return null;
  const topSources = workSources.slice(0, 5);
  return [
    "## Priority Queue",
    `I found ${workSources.length} open task${workSources.length === 1 ? "" : "s"} to prioritize. The cards below are the primary answer; they are ranked by overdue/due date, priority, and current status.`,
    "",
    "## Top Items",
    ...topSources.map((source, index) => `- ${index + 1}. ${formatFactItem(source)}. [${source.sourceId}]`),
    "",
    "## Next Actions",
    ...topSources.map((source) => `- ${recommendedAction(source)}`)
  ].filter(Boolean).join("\n");
}

function buildTaskProgressAnswer(sources: GroundingSource[]) {
  const source = sources.find((item) => (item.type === "Task" || item.type === "Ticket") && item.facts);
  if (!source?.facts) return null;
  const facts = source.facts;
  const progressParts = [
    typeof facts.progressPercent === "number" ? `${facts.progressPercent}% progress` : "",
    typeof facts.checklistDone === "number" && typeof facts.checklistTotal === "number" ? `${facts.checklistDone}/${facts.checklistTotal} checklist items done` : "",
    typeof facts.actualMinutes === "number" ? `${formatMinutes(facts.actualMinutes)} tracked` : "",
    typeof facts.estimateMinutes === "number" ? `${formatMinutes(facts.estimateMinutes)} estimated` : ""
  ].filter(Boolean);
  const notesLine = facts.notes ? `Progress notes recorded: ${facts.notes}` : "No progress notes are recorded for this task.";
  const checklistLine = typeof facts.checklistTotal === "number" && facts.checklistTotal > 0
    ? `${facts.checklistDone ?? 0} of ${facts.checklistTotal} checklist items are complete.`
    : "No checklist items are recorded.";
  const statusLine = `${source.title} is ${facts.status ?? "not statused"} with ${facts.priority ?? "unspecified"} priority${facts.dueDate ? ` and is ${formatDueFact(facts)}` : ""}. [${source.sourceId}]`;
  const hasConcreteProgress = Boolean(facts.notes)
    || Boolean((facts.checklistDone ?? 0) > 0)
    || Boolean((facts.actualMinutes ?? 0) > 0)
    || Boolean((facts.progressPercent ?? 0) > 0);

  return [
    "## Summary",
    hasConcreteProgress
      ? `${statusLine} Recorded progress signals: ${progressParts.join("; ") || "none"}.`
      : `${statusLine} I do not see concrete progress notes, completed checklist items, tracked time, or a non-zero progress percentage recorded yet. [${source.sourceId}]`,
    "",
    "## Progress Evidence",
    `- Status: ${facts.status ?? "Unknown"}. [${source.sourceId}]`,
    `- Progress: ${progressParts.join("; ") || "No progress fields recorded"}. [${source.sourceId}]`,
    `- Checklist: ${checklistLine} [${source.sourceId}]`,
    `- Notes: ${notesLine} [${source.sourceId}]`,
    facts.updatedAt ? `- Last updated: ${facts.updatedAt}. [${source.sourceId}]` : "",
    facts.description ? `- Description/context: ${facts.description} [${source.sourceId}]` : "",
    "",
    "## What This Means",
    hasConcreteProgress
      ? `There is some recorded progress on ${source.title}, but the useful progress trail is limited to the fields above. [${source.sourceId}]`
      : `The task appears to have moved to ${facts.status ?? "its current status"}, but the workspace does not yet show detailed progress evidence such as notes, checklist completion, or tracked time. [${source.sourceId}]`,
    "",
    "## Next Actions",
    facts.isOverdue ? `- Bring this overdue task back on track first; it is ${formatDueFact(facts)}. [${source.sourceId}]` : "",
    "- Add a progress note with what changed, what is blocked, and the next concrete step.",
    facts.checklistTotal ? "- Update checklist items as work is completed." : "- Add checklist items if this task has multiple steps.",
    typeof facts.progressPercent === "number" ? "- Update the progress percentage after the next meaningful change." : "",
    "",
    "## Missing Context",
    facts.notes ? "- No major missing progress note context detected." : "- Progress notes are missing.",
    facts.checklistTotal ? "" : "- Checklist/work breakdown is missing.",
    typeof facts.actualMinutes === "number" && facts.actualMinutes > 0 ? "" : "- Tracked time is not recorded."
  ].filter(Boolean).join("\n");
}

function buildOpenWorkAnswer(sources: GroundingSource[]) {
  const workSources = sources.filter((source) => source.facts?.workState === "open" && (source.type === "Task" || source.type === "Ticket"));
  if (workSources.length === 0) return null;
  const overdue = workSources.filter((source) => source.facts?.isOverdue);
  const dueToday = workSources.filter((source) => source.facts?.isDueToday);
  const inProgress = workSources.filter((source) => source.facts?.status === "In Progress");
  const upcoming = workSources.filter((source) => source.facts?.dueDate && !source.facts?.isOverdue && !source.facts?.isDueToday);
  return [
    "## Summary",
    `There ${workSources.length === 1 ? "is" : "are"} ${workSources.length} open work item${workSources.length === 1 ? "" : "s"} in the retrieved workspace context: ${overdue.length} overdue, ${dueToday.length} due today, ${inProgress.length} in progress, and ${upcoming.length} upcoming.`,
    "",
    "## Priority List",
    ...formatWorkGroup("Overdue", overdue),
    ...formatWorkGroup("Due today", dueToday),
    ...formatWorkGroup("In progress", inProgress.filter((source) => !overdue.includes(source) && !dueToday.includes(source))),
    ...formatWorkGroup("Upcoming", upcoming.filter((source) => !overdue.includes(source) && !dueToday.includes(source))),
    "",
    "## Next Actions",
    ...workSources.slice(0, 5).map((source) => `- ${recommendedAction(source)}`),
    "",
    "## Missing Context",
    ...formatMissingContext(workSources)
  ].filter(Boolean).join("\n");
}

function formatWorkGroup(label: string, sources: GroundingSource[]) {
  if (sources.length === 0) return [`- ${label}: none.`];
  return sources.map((source) => `- ${label}: ${formatFactItem(source)}.`);
}

function recommendedAction(source: GroundingSource) {
  const facts = source.facts ?? {};
  if (facts.isOverdue) return `${source.title}: resolve or re-plan this first because it is ${formatDueFact(facts)}. [${source.sourceId}]`;
  if (facts.status === "In Progress") return `${source.title}: record the latest progress note and define the next step. [${source.sourceId}]`;
  if (source.type === "Ticket" || facts.ticketNumber) return `${source.title}: fill investigation/resolution details and work toward the due date. [${source.sourceId}]`;
  return `${source.title}: confirm the next action and update status/progress. [${source.sourceId}]`;
}

function formatMissingContext(sources: GroundingSource[]) {
  const missing = sources
    .map((source) => {
      const fields = getMissingUsefulFields(source);
      return fields.length ? `- ${source.title}: missing ${fields.join(", ")}. [${source.sourceId}]` : "";
    })
    .filter(Boolean);
  return missing.length ? missing : ["- No major missing context detected in the retrieved sources."];
}

function buildGroundedPrompt(question: string, sources: GroundingSource[], query: QueryUnderstanding) {
  const sourceText = sources
    .map((source) => [
      `[${source.sourceId}] ${source.type}: ${source.title}`,
      source.summary
    ].join("\n"))
    .join("\n\n");
  const factsBrief = buildWorkspaceFactsBrief(sources);
  const ragBrief = buildRagRetrievalBrief(query, sources);

  return [
    "You are running inside a RAG workflow for What's Next?.",
    "Use the original user prompt and the retrieved workspace evidence to infer intent and answer naturally.",
    "The retrieval engine already indexed and scored workspace chunks; do not ask for the user to restate the question when the evidence is enough.",
    "Use only the retrieved workspace sources below. Do not invent work, causes, status changes, dates, filenames, SQL behavior, or relationships.",
    "If the retrieved sources are insufficient for the actual user prompt, say exactly what is missing instead of guessing.",
    "Be helpful first: synthesize, group related records, explain what changed, and give practical next actions.",
    "Do not copy source summaries line-by-line. Convert backend enum values and raw fields into human wording.",
    "Answer the user's actual wording. For example, a work-summary prompt should summarize work done, not only list open items.",
    "When a RAG or Workspace facts brief is provided, treat it as authoritative for counts, timer totals, urgency categories, overdue status, and missing fields.",
    "Never contradict the facts brief. If it says one item is overdue or a timer total is 1m 10s, do not say otherwise.",
    "For task questions, lead with the most urgent work first: overdue, due today, high priority, in progress, then upcoming.",
    "For activity-summary questions, lead with what the user appears to have worked on, how much time is recorded, and which records changed in the requested period.",
    "For ticket questions, include customer, severity, current investigation/resolution status, and next support action when present.",
    "For knowledge/documentation questions, separate known facts from missing information.",
    "Mention overdue or blocked status clearly when the source says so.",
    "Do not list root-cause/resolution gaps for ordinary tasks unless the user asks for RCA or the source is a ticket/knowledge article.",
    "If the sources are related but incomplete, say what is known and list only gaps that matter to the user's question.",
    "If the answer is not supported by the sources, say: \"I do not have sufficient information in this workspace to answer that confidently.\"",
    "Format the answer in concise markdown with these sections when useful:",
    "Summary",
    "Priority list",
    "Next actions",
    "Missing context",
    "Omit empty or irrelevant sections.",
    "Cite source ids inline beside every evidence-backed task, ticket, SQL, note, file, or article claim.",
    "Do not include a separate \"Cite source ids\" section.",
    "Do not include raw record ids unless requested.",
    "",
    `Original user prompt: ${question}`,
    "",
    ragBrief,
    ragBrief ? "" : "",
    factsBrief,
    factsBrief ? "" : "",
    "Retrieved workspace evidence:",
    sourceText
  ].join("\n");
}

function buildWorkspaceFactsBrief(sources: GroundingSource[]) {
  const workSources = sources.filter((source) => source.facts?.workState === "open" && (source.type === "Task" || source.type === "Ticket"));
  if (workSources.length === 0) return "";

  const overdue = workSources.filter((source) => source.facts?.isOverdue);
  const dueToday = workSources.filter((source) => source.facts?.isDueToday);
  const highPriority = workSources.filter((source) => ["High", "Urgent"].includes(source.facts?.priority ?? ""));
  const inProgress = workSources.filter((source) => source.facts?.status === "In Progress");
  const upcoming = workSources.filter((source) => source.facts?.dueDate && !source.facts?.isOverdue && !source.facts?.isDueToday);
  const ticketWork = workSources.filter((source) => source.type === "Ticket" || source.facts?.ticketNumber);
  const missingFields = workSources
    .map((source) => {
      const missing = getMissingUsefulFields(source);
      return missing.length ? `${source.sourceId}: ${missing.join(", ")}` : "";
    })
    .filter(Boolean);

  return [
    "Workspace facts brief:",
    `Open work items: ${workSources.length}`,
    formatFactGroup("Overdue", overdue),
    formatFactGroup("Due today", dueToday),
    formatFactGroup("High priority", highPriority),
    formatFactGroup("In progress", inProgress),
    formatFactGroup("Upcoming", upcoming),
    ticketWork.length ? `Ticket-backed work: ${ticketWork.map(formatFactItem).join(" | ")}` : "Ticket-backed work: none",
    missingFields.length ? `Missing useful fields: ${missingFields.join(" | ")}` : "Missing useful fields: none",
    "Suggested answer shape: start with an exact count, call out urgent/overdue work first, then give concrete next actions per item."
  ].join("\n");
}

function buildRagRetrievalBrief(query: QueryUnderstanding, sources: GroundingSource[]) {
  const intents = Array.from(query.intents);
  const sourceTypes = countBy(sources.map((source) => source.type));
  const timeSummary = sources.find((source) => source.type === "Time Entry" && source.id.startsWith("time-summary"));
  const timeTaskSources = sources.filter((source) => source.type === "Time Entry" && !source.id.startsWith("time-summary") && source.facts);
  const touchedSources = sources.filter((source) => source.type !== "Time Entry" && source.facts?.activityReason);
  const openWork = sources.filter((source) => source.facts?.workState === "open" && (source.type === "Task" || source.type === "Ticket"));
  const overdue = openWork.filter((source) => source.facts?.isOverdue);

  const lines = [
    "RAG retrieval brief:",
    intents.length ? `Detected intent: ${intents.join(", ")}` : "Detected intent: general workspace lookup",
    query.temporalHints.size ? `Time scope requested: ${Array.from(query.temporalHints).join(", ")}` : "",
    `Retrieved source mix: ${Object.entries(sourceTypes).map(([type, count]) => `${type} ${count}`).join(", ") || "none"}.`,
    timeSummary?.facts ? `Authoritative tracked time: ${formatSecondsDuration(timeSummary.facts.durationSec ?? 0)} ${timeSummary.facts.timeRangeLabel ?? ""} across ${timeSummary.facts.timeEntryCount ?? 0} entr${timeSummary.facts.timeEntryCount === 1 ? "y" : "ies"} [${timeSummary.sourceId}].` : "",
    timeTaskSources.length ? `Time by task/session: ${timeTaskSources.slice(0, 6).map((source) => `${source.title} ${formatSecondsDuration(source.facts?.durationSec ?? 0)} [${source.sourceId}]`).join(" | ")}.` : "",
    touchedSources.length ? `Records touched in requested/recent period: ${touchedSources.slice(0, 8).map((source) => `${source.title} (${source.type}, ${source.facts?.activityReason}) [${source.sourceId}]`).join(" | ")}.` : "",
    openWork.length ? `Open work in retrieved evidence: ${openWork.length}; overdue: ${overdue.length}.` : "",
    "Answer contract: cite source ids inline, be specific, and say when the retrieved evidence cannot prove something."
  ].filter(Boolean);
  return lines.join("\n");
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatFactGroup(label: string, sources: GroundingSource[]) {
  return `${label} (${sources.length}): ${sources.length ? sources.map(formatFactItem).join(" | ") : "none"}`;
}

function formatFactItem(source: GroundingSource) {
  const facts = source.facts ?? {};
  return [
    `[${source.sourceId}] ${source.title}`,
    facts.status ? `status ${facts.status}` : "",
    facts.priority ? `priority ${facts.priority}` : "",
    facts.dueDate ? formatDueFact(facts) : "",
    facts.customer ? `customer ${facts.customer}` : "",
    facts.severity ? `severity ${facts.severity}` : ""
  ].filter(Boolean).join("; ");
}

function formatActivitySourceLine(source: GroundingSource) {
  const facts = source.facts ?? {};
  const parts = [
    `${source.title} [${source.sourceId}]`,
    source.type,
    facts.activityReason,
    facts.status ? `status ${facts.status}` : "",
    facts.priority ? `priority ${facts.priority}` : "",
    facts.dueDate ? formatDueFact(facts) : "",
    typeof facts.progressPercent === "number" ? `${facts.progressPercent}% progress` : "",
    typeof facts.actualMinutes === "number" && facts.actualMinutes > 0 ? `${formatMinutes(facts.actualMinutes)} task time` : "",
    facts.latestNote ? `latest note: ${facts.latestNote}` : "",
    facts.description && source.type !== "Task" && source.type !== "Ticket" ? truncateText(facts.description, 160) : ""
  ].filter(Boolean);
  return parts.join("; ");
}

function formatDueFact(facts: SourceFacts) {
  if (!facts.dueDate) return "";
  if (facts.isOverdue) return `due ${facts.dueDate}, overdue${facts.daysOverdue ? ` by ${facts.daysOverdue} day${facts.daysOverdue === 1 ? "" : "s"}` : ""}`;
  if (facts.isDueToday) return `due today (${facts.dueDate})`;
  if (facts.isDueThisWeek) return `due this week (${facts.dueDate})`;
  if (facts.isDueThisMonth) return `due this month (${facts.dueDate})`;
  return `due ${facts.dueDate}`;
}

function getMissingUsefulFields(source: GroundingSource) {
  const facts = source.facts;
  if (!facts) return [];
  const missing: string[] = [];
  if (source.type === "Ticket" || facts.ticketNumber) {
    if (!facts.customer) missing.push("customer");
    if (!facts.investigation) missing.push("investigation");
    if (!facts.resolution) missing.push("resolution");
  }
  if (!facts.description) missing.push("description");
  return missing;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getChecklistFacts(value: unknown) {
  if (!Array.isArray(value)) return { done: 0, total: 0 };
  const items = value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>;
  return {
    done: items.filter((item) => item.done === true).length,
    total: items.length
  };
}

function labeledValue(label: string, value: string) {
  const normalized = value.trim();
  return normalized ? `${label}: ${normalized}` : "";
}

function buildAttentionLine(facts: SourceFacts) {
  if (facts.isOverdue) return `Attention: Overdue${facts.daysOverdue ? ` by ${facts.daysOverdue} day${facts.daysOverdue === 1 ? "" : "s"}` : ""}.`;
  if (facts.isDueToday) return "Attention: Due today.";
  if (facts.priority === "Urgent" || facts.priority === "High") return `Attention: ${facts.priority} priority.`;
  if (facts.status === "In Progress") return "Attention: In progress.";
  if (facts.workState === "open") return "Attention: Open work item.";
  return "";
}

function buildDueLine(facts: SourceFacts) {
  if (!facts.dueDate) return "";
  return `Due signal: ${formatDueFact(facts)}.`;
}

function getDueFacts(dueDate?: Date | null): Pick<SourceFacts, "isOverdue" | "daysOverdue" | "isDueToday" | "isDueThisWeek" | "isDueThisMonth"> {
  if (!dueDate) return {};
  const today = startOfDay(new Date());
  const dueDay = startOfDay(dueDate);
  const week = getCurrentWeekRange(today);
  const month = getCurrentMonthRange(today);
  const dayDiff = Math.round((today.getTime() - dueDay.getTime()) / 86_400_000);
  return {
    isOverdue: dayDiff > 0,
    daysOverdue: dayDiff > 0 ? dayDiff : undefined,
    isDueToday: dayDiff === 0,
    isDueThisWeek: dueDate >= week.start && dueDate < week.end,
    isDueThisMonth: dueDate >= month.start && dueDate < month.end
  };
}

function getTaskStatusAliases(status: string) {
  if (isClosedTaskStatus(status)) return ["closed", "done", "completed", "finished", "resolved"];
  const statusLabel = formatWorkspaceLabel(status);
  return ["open", "active", "ongoing", "unresolved", "not done", status, statusLabel];
}

function getTicketStatusAliases(status: string) {
  if (isClosedTicketStatus(status)) return ["closed", "done", "completed", "finished", "resolved"];
  const statusLabel = formatWorkspaceLabel(status);
  return ["open", "active", "ongoing", "unresolved", "not done", status, statusLabel];
}

function isClosedTaskStatus(status: string) {
  return status === "DONE" || status === "CANCELED";
}

function isClosedTicketStatus(status: string) {
  return status === "RESOLVED" || status === "CLOSED";
}

function formatWorkspaceLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function taskNotesText(value: unknown) {
  return getTaskNotes(value)
    .map((note) => note.body)
    .join(" | ");
}

function taskLatestNote(value: unknown) {
  const notes = getTaskNotes(value);
  if (notes.length === 0) return null;
  return [...notes].sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    return rightTime - leftTime;
  })[0] ?? notes[notes.length - 1];
}

function getTaskNotes(value: unknown): Array<{ body: string; createdAt?: string }> {
  if (!Array.isArray(value)) return [];
  const notes: Array<{ body: string; createdAt?: string }> = [];
  for (const item of value) {
    const record = readRecord(item);
    const body = readString(record.body).trim();
    const createdAt = readString(record.createdAt);
    if (body) notes.push(createdAt ? { body, createdAt } : { body });
  }
  return notes;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatMinutes(minutes?: number) {
  if (!minutes || minutes <= 0) return "0 minutes";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatSecondsDuration(seconds?: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds ?? 0));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  if (hours > 0) return remainingSeconds > 0 ? `${hours}h ${minutes}m ${remainingSeconds}s` : minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function currentRunSeconds(startedAt: Date) {
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
}

function getTaskDateLabels(task: { dueDate?: Date | null; createdAt: Date; updatedAt: Date }) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const week = getCurrentWeekRange(today);
  const month = getCurrentMonthRange(today);
  const labels = getRecordDateLabels(task);
  if (task.dueDate && startOfDay(task.dueDate).getTime() === today.getTime()) labels.push("due today");
  if (task.dueDate && startOfDay(task.dueDate).getTime() === tomorrow.getTime()) labels.push("due tomorrow");
  if (task.dueDate && task.dueDate >= week.start && task.dueDate < week.end) labels.push("due this week");
  if (task.dueDate && task.dueDate >= month.start && task.dueDate < month.end) labels.push("due this month");
  if (task.dueDate && startOfDay(task.dueDate).getTime() < today.getTime()) labels.push("overdue", "past due");
  return Array.from(new Set(labels));
}

function getRecordDateLabels(record: { createdAt?: Date | null; updatedAt?: Date | null }) {
  const today = startOfDay(new Date());
  const week = getCurrentWeekRange(today);
  const month = getCurrentMonthRange(today);
  const labels: string[] = [];
  if (record.createdAt) addRecordDateLabel(labels, "created", record.createdAt, today, week, month);
  if (record.updatedAt) addRecordDateLabel(labels, "updated", record.updatedAt, today, week, month);
  return labels;
}

function summarizeRecordActivity(record: { createdAt?: Date | null; updatedAt?: Date | null }) {
  const labels = getRecordDateLabels(record);
  if (labels.includes("updated today")) return "updated today";
  if (labels.includes("created today")) return "created today";
  if (labels.includes("updated this week")) return "updated this week";
  if (labels.includes("created this week")) return "created this week";
  if (labels.includes("updated this month")) return "updated this month";
  if (labels.includes("created this month")) return "created this month";
  if (labels.includes("updated recently")) return "updated recently";
  if (labels.includes("created recently")) return "created recently";
  return undefined;
}

function addRecordDateLabel(labels: string[], prefix: "created" | "updated", value: Date, today: Date, week: { start: Date; end: Date }, month: { start: Date; end: Date }) {
  const day = startOfDay(value);
  if (day.getTime() === today.getTime()) labels.push(`${prefix} today`);
  if (value >= week.start && value < week.end) labels.push(`${prefix} this week`);
  if (value >= month.start && value < month.end) labels.push(`${prefix} this month`);
  const recentFloor = new Date(today);
  recentFloor.setDate(today.getDate() - 14);
  if (value >= recentFloor) labels.push(`${prefix} recently`);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getCurrentWeekRange(today: Date) {
  const start = startOfDay(today);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function getCurrentMonthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { start, end };
}

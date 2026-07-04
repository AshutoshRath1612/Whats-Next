import assert from "node:assert/strict";
import test from "node:test";
import { getFlowSteps, runWithRequestFlow } from "../common/logging/request-flow-context";
import { AiService } from "./ai.service";

test("AiService treats placeholder provider keys as not configured", async () => {
  const prisma = {
    aiMessage: {
      create: async () => ({ id: "message-id" })
    }
  };
  const config = {
    get: (key: string) => key === "OPENAI_API_KEY" ? "sk-abcdef1234567890abcdef1234567890abcdef12" : undefined
  };
  const service = new AiService(prisma as never, config as never);

  await assert.rejects(
    () => service.suggest("user-id", "Prioritize my day"),
    /AI provider is not configured/
  );
});

test("AiService can use Groq as an alternate OpenAI-compatible provider", async () => {
  const createdMessages: Array<{ data: { role: string; content: string } }> = [];
  const prisma = {
    aiMessage: {
      create: async (input: { data: { role: string; content: string } }) => {
        createdMessages.push(input);
        return { id: "message-id" };
      }
    }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedBody = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "Groq answer" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    let providerSuccessStep: ReturnType<typeof getFlowSteps>[number] | undefined;
    const result = await runWithRequestFlow({ requestId: "test-request-id", startedAt: new Date() }, async () => {
      const response = await service.suggest("user-id", "Prioritize my day");
      providerSuccessStep = getFlowSteps().find((step) => step.step === "ai.provider.completed");
      return response;
    });

    assert.equal(result.content, "Groq answer");
    assert.equal(result.provider, "groq");
    assert.equal(result.model, "llama-3.1-8b-instant");
    assert.equal(requestedUrl, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(JSON.parse(requestedBody).model, "llama-3.1-8b-instant");
    assert.equal(providerSuccessStep?.target, "Groq.chat.completions");
    assert.equal((providerSuccessStep?.data as { provider?: string; model?: string } | undefined)?.provider, "groq");
    assert.deepEqual(createdMessages.map((message) => message.data.role), ["user", "assistant"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService can use Puter as an alternate AI provider", async () => {
  const createdMessages: Array<{ data: { role: string; content: string } }> = [];
  const prisma = {
    aiMessage: {
      create: async (input: { data: { role: string; content: string } }) => {
        createdMessages.push(input);
        return { id: "message-id" };
      }
    }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "puter",
    PUTER_AUTH_TOKEN: "puter-real-test-token",
    PUTER_MODEL: "gpt-5.4-mini",
    PUTER_USAGE_GUARD_ENABLED: "false"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const service = new AiService(prisma as never, config as never);
  let capturedAuthToken = "";
  let capturedMessages: Array<{ role: string; content: string }> = [];
  let capturedOptions: Record<string, unknown> = {};

  (service as unknown as {
    loadPuterInit: () => Promise<(authToken?: string) => {
      ai: {
        chat: (messages: Array<{ role: string; content: string }>, options?: Record<string, unknown>) => Promise<unknown>;
      };
    }>;
  }).loadPuterInit = async () => (authToken?: string) => {
    capturedAuthToken = authToken ?? "";
    return {
      ai: {
        chat: async (messages, options) => {
          capturedMessages = messages;
          capturedOptions = options ?? {};
          return { message: { content: "Puter answer" } };
        }
      }
    };
  };

  let providerSuccessStep: ReturnType<typeof getFlowSteps>[number] | undefined;
  const result = await runWithRequestFlow({ requestId: "test-request-id", startedAt: new Date() }, async () => {
    const response = await service.suggest("user-id", "Prioritize my day");
    providerSuccessStep = getFlowSteps().find((step) => step.step === "ai.provider.completed");
    return response;
  });

  assert.equal(result.content, "Puter answer");
  assert.equal(result.provider, "puter");
  assert.equal(result.providerLabel, "Puter");
  assert.equal(result.model, "gpt-5.4-mini");
  assert.equal(capturedAuthToken, "puter-real-test-token");
  assert.deepEqual(capturedMessages.map((message) => message.role), ["system", "user"]);
  assert.equal(capturedOptions.model, "gpt-5.4-mini");
  assert.equal(providerSuccessStep?.target, "Puter.ai.chat");
  assert.equal((providerSuccessStep?.data as { provider?: string; endpoint?: string } | undefined)?.provider, "puter");
  assert.equal((providerSuccessStep?.data as { provider?: string; endpoint?: string } | undefined)?.endpoint, "puter://ai.chat");
  assert.deepEqual(createdMessages.map((message) => message.data.role), ["user", "assistant"]);
});

test("AiService auto mode can prefer Puter before Groq while Puter is under budget", async () => {
  const prisma = {
    aiMessage: {
      create: async () => ({ id: "message-id" })
    }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "auto",
    AI_AUTO_PROVIDER_ORDER: "puter,groq",
    PUTER_AUTH_TOKEN: "puter-real-test-token",
    PUTER_MODEL: "gpt-5.4-mini",
    PUTER_USAGE_MAX_PERCENT: "80",
    PUTER_USAGE_MIN_REMAINING: "1000000",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const service = new AiService(prisma as never, config as never);
  let usageChecks = 0;
  let puterChatCalls = 0;
  const originalFetch = globalThis.fetch;
  let groqFetchCalled = false;
  globalThis.fetch = async () => {
    groqFetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: "Groq answer" } }] }), { status: 200 });
  };

  (service as unknown as {
    loadPuterInit: () => Promise<(authToken?: string) => {
      ai: {
        chat: (messages: Array<{ role: string; content: string }>, options?: Record<string, unknown>) => Promise<unknown>;
      };
      auth: {
        getMonthlyUsage: () => Promise<unknown>;
      };
    }>;
  }).loadPuterInit = async () => () => ({
    ai: {
      chat: async () => {
        puterChatCalls += 1;
        return { message: { content: "Puter under-budget answer" } };
      }
    },
    auth: {
      getMonthlyUsage: async () => {
        usageChecks += 1;
        return {
          usage: { total: 105_000 },
          allowanceInfo: { monthUsageAllowance: 25_000_000, remaining: 24_895_000 }
        };
      }
    }
  });

  try {
    let budgetStep: ReturnType<typeof getFlowSteps>[number] | undefined;
    const result = await runWithRequestFlow({ requestId: "test-request-id", startedAt: new Date() }, async () => {
      const response = await service.suggest("user-id", "Prioritize my day");
      budgetStep = getFlowSteps().find((step) => step.step === "ai.provider.budget.approved");
      return response;
    });

    assert.equal(result.provider, "puter");
    assert.equal(result.content, "Puter under-budget answer");
    assert.equal(usageChecks, 1);
    assert.equal(puterChatCalls, 1);
    assert.equal(groqFetchCalled, false);
    assert.equal((budgetStep?.data as { usedPercent?: number } | undefined)?.usedPercent, 0.42);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService auto mode skips Puter after the usage threshold and falls back to Groq", async () => {
  const prisma = {
    aiMessage: {
      create: async () => ({ id: "message-id" })
    }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "auto",
    AI_AUTO_PROVIDER_ORDER: "puter,groq",
    PUTER_AUTH_TOKEN: "puter-real-test-token",
    PUTER_MODEL: "gpt-5.4-mini",
    PUTER_USAGE_MAX_PERCENT: "80",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const service = new AiService(prisma as never, config as never);
  let puterChatCalls = 0;
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Groq fallback answer" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  (service as unknown as {
    loadPuterInit: () => Promise<(authToken?: string) => {
      ai: {
        chat: (messages: Array<{ role: string; content: string }>, options?: Record<string, unknown>) => Promise<unknown>;
      };
      auth: {
        getMonthlyUsage: () => Promise<unknown>;
      };
    }>;
  }).loadPuterInit = async () => () => ({
    ai: {
      chat: async () => {
        puterChatCalls += 1;
        return { message: { content: "Puter should be skipped" } };
      }
    },
    auth: {
      getMonthlyUsage: async () => ({
        usage: { total: 21_000_000 },
        allowanceInfo: { monthUsageAllowance: 25_000_000, remaining: 4_000_000 }
      })
    }
  });

  try {
    let skippedStep: ReturnType<typeof getFlowSteps>[number] | undefined;
    const result = await runWithRequestFlow({ requestId: "test-request-id", startedAt: new Date() }, async () => {
      const response = await service.suggest("user-id", "Prioritize my day");
      skippedStep = getFlowSteps().find((step) => step.step === "ai.provider.budget.skipped");
      return response;
    });

    assert.equal(result.provider, "groq");
    assert.equal(result.content, "Groq fallback answer");
    assert.equal(puterChatCalls, 0);
    assert.equal(requestedUrl, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal((skippedStep?.data as { usedPercent?: number } | undefined)?.usedPercent, 84);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask refuses vague questions without provider calls", async () => {
  const createdMessages: Array<{ data: { role: string; content: string } }> = [];
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async (input: { data: { role: string; content: string } }) => {
        createdMessages.push(input);
        return { id: "message-id" };
      }
    },
    knowledgeArticle: { findMany: async () => [] },
    task: { findMany: async () => [] },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const config = {
    get: () => undefined
  };
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("", { status: 500 });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "How can this ticket be solved?");

    assert.equal(fetchCalled, false);
    assert.equal(result.sufficientContext, false);
    assert.deepEqual(result.sources, []);
    assert.match(result.content, /sufficient relevant workspace information/);
    assert.deepEqual(createdMessages.map((message) => message.data.role), ["user", "assistant"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask sends relevant sources to the provider", async () => {
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: {
      findMany: async () => [{
        id: "article-1",
        title: "Gateway timeout runbook",
        problem: "Payments API returns gateway timeout during settlement callbacks.",
        rootCause: "Connection pool exhaustion in the settlement worker.",
        resolution: "Restart the settlement worker and reduce callback batch size.",
        tags: ["payments", "timeout"],
        references: ["NX-123"],
        updatedAt: new Date()
      }]
    },
    task: { findMany: async () => [] },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  let requestedBody = "";
  globalThis.fetch = async (_input, init) => {
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "Use the settlement worker runbook [S1]." } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "payments gateway timeout NX-123");
    const body = JSON.parse(requestedBody);
    const userPrompt = body.messages.find((message: { role: string }) => message.role === "user")?.content as string;

    assert.equal(result.sufficientContext, true);
    assert.equal(result.provider, "groq");
    assert.equal(result.sources[0].sourceId, "S1");
    assert.equal(result.sources[0].type, "Knowledge Article");
    assert.match(userPrompt, /\[S1\] Knowledge Article: Gateway timeout runbook/);
    assert.match(userPrompt, /Connection pool exhaustion/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask maps natural language aliases to knowledge sources", async () => {
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: {
      findMany: async () => [{
        id: "article-1",
        title: "Gateway timeout runbook",
        problem: "Payments API returns gateway timeout during settlement callbacks.",
        rootCause: "Connection pool exhaustion in the settlement worker.",
        resolution: "Restart the settlement worker and reduce callback batch size.",
        tags: ["payments", "timeout"],
        references: ["NX-123"],
        updatedAt: new Date()
      }]
    },
    task: { findMany: async () => [] },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  let requestedBody = "";
  globalThis.fetch = async (_input, init) => {
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "The payment failure runbook is relevant [S1]." } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "Any docs for payment failure?");
    const body = JSON.parse(requestedBody);
    const userPrompt = body.messages.find((message: { role: string }) => message.role === "user")?.content as string;

    assert.equal(result.sufficientContext, true);
    assert.equal(result.sources[0].type, "Knowledge Article");
    assert.match(userPrompt, /Gateway timeout runbook/);
    assert.match(userPrompt, /Payments API returns gateway timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask tolerates common typos while staying grounded", async () => {
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: { findMany: async () => [] },
    task: { findMany: async () => [] },
    ticket: { findMany: async () => [] },
    note: {
      findMany: async () => [{
        id: "note-1",
        title: "Customer escalation checklist",
        content: "Steps for refund approval and customer follow-up.",
        tags: ["support"],
        updatedAt: new Date()
      }]
    },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "Use the escalation checklist [S1]." } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "custmer esclation notes");

    assert.equal(result.sufficientContext, true);
    assert.equal(result.sources[0].type, "Note");
    assert.equal(result.sources[0].title, "Customer escalation checklist");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask maps open items typo to open task and ticket work", async () => {
  const now = new Date();
  const overdueDate = new Date(now);
  overdueDate.setDate(now.getDate() - 2);
  const upcomingDate = new Date(now);
  upcomingDate.setDate(now.getDate() + 12);
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: { findMany: async () => [] },
    task: {
      findMany: async () => [
        {
          id: "task-1",
          title: "Test task",
          description: "Captured from What's Next?",
          status: "IN_PROGRESS",
          priority: "MEDIUM",
          labels: [],
          tags: [],
          dueDate: overdueDate,
          createdAt: now,
          updatedAt: now,
          customFields: {}
        },
        {
          id: "task-2",
          title: "MW-5062: Another Test",
          description: "Captured from What's Next?",
          status: "TODO",
          priority: "MEDIUM",
          labels: ["ticket"],
          tags: ["ticket"],
          dueDate: upcomingDate,
          createdAt: now,
          updatedAt: now,
          customFields: { workType: "Ticket", ticketNumber: "5062", customer: "Internal", severity: "Medium" }
        },
        {
          id: "task-3",
          title: "Already finished task",
          description: "This should not appear in open item results.",
          status: "DONE",
          priority: "LOW",
          labels: [],
          tags: [],
          dueDate: overdueDate,
          createdAt: overdueDate,
          updatedAt: overdueDate,
          customFields: {}
        }
      ]
    },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async (_input, init) => {
    fetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: "There are two open items: Test task [S1] and MW-5062 [S2]." } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const typoResult = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "what are the open itms");
    const exactResult = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "what are the open items");

    assert.equal(fetchCalled, false);
    assert.equal(typoResult.sufficientContext, true);
    assert.equal(exactResult.sufficientContext, true);
    assert.deepEqual(typoResult.sources.map((source) => source.type).sort(), ["Task", "Ticket"]);
    assert.deepEqual(exactResult.sources.map((source) => source.type).sort(), ["Task", "Ticket"]);
    assert.match(exactResult.content, /There are 2 open work items/);
    assert.match(exactResult.content, /Overdue: \[S\d\] Test task/);
    assert.match(exactResult.content, /Upcoming: \[S\d\] 5062 MW-5062: Another Test/);
    assert.doesNotMatch(exactResult.content, /Already finished task/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask ranks priority tasks without requiring literal content matches", async () => {
  const now = new Date();
  const overdueDate = new Date(now);
  overdueDate.setDate(now.getDate() - 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 5);
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: { findMany: async () => [] },
    task: {
      findMany: async () => [
        {
          id: "task-high",
          title: "Restore webhook delivery",
          description: "Webhook failures affect customer notifications.",
          status: "TODO",
          priority: "HIGH",
          labels: [],
          tags: [],
          checklist: [],
          dueDate: overdueDate,
          timeEstimate: 60,
          actualTime: 0,
          createdAt: now,
          updatedAt: now,
          customFields: { progress: 0 }
        },
        {
          id: "task-medium",
          title: "Review dashboard copy",
          description: "Polish wording for dashboard cards.",
          status: "IN_PROGRESS",
          priority: "MEDIUM",
          labels: [],
          tags: [],
          checklist: [],
          dueDate: nextWeek,
          timeEstimate: 30,
          actualTime: 10,
          createdAt: now,
          updatedAt: now,
          customFields: { progress: 30 }
        },
        {
          id: "task-done",
          title: "Closed setup task",
          description: "Already completed.",
          status: "DONE",
          priority: "URGENT",
          labels: [],
          tags: [],
          checklist: [],
          dueDate: overdueDate,
          timeEstimate: 15,
          actualTime: 15,
          createdAt: now,
          updatedAt: now,
          customFields: { progress: 100 }
        }
      ]
    },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const config = {
    get: () => undefined
  };
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: "Provider should not be called." } }] }), { status: 200 });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "Priority tasks");

    assert.equal(fetchCalled, false);
    assert.equal(result.sufficientContext, true);
    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].title, "Restore webhook delivery");
    assert.equal(result.sources[1].title, "Review dashboard copy");
    assert.match(result.content, /Priority Queue/);
    assert.doesNotMatch(result.content, /Closed setup task/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask answers weekly tracked time from time entries", async () => {
  const now = new Date();
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: { findMany: async () => [] },
    task: { findMany: async () => [] },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] },
    timeEntry: {
      findMany: async () => [{
        id: "time-1",
        title: "Focus: Test task",
        taskId: "task-1",
        status: "STOPPED",
        startedAt: now,
        durationSec: 75,
        durationMin: 1,
        task: { id: "task-1", title: "Test task", status: "IN_PROGRESS", priority: "MEDIUM" }
      }]
    }
  };
  const config = {
    get: () => undefined
  };
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: "Provider should not be called." } }] }), { status: 200 });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "How much time did i work this week");

    assert.equal(fetchCalled, false);
    assert.equal(result.sufficientContext, true);
    assert.equal(result.sources[0].type, "Time Entry");
    assert.equal(result.sources[0].facts?.durationSec, 75);
    assert.match(result.content, /You worked 1m 15s this week/);
    assert.match(result.content, /Test task: 1m 15s/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask summarizes monthly work from time entries and touched records", async () => {
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(now.getDate() + 7);
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: { findMany: async () => [] },
    task: {
      findMany: async () => [
        {
          id: "task-1",
          title: "Test task",
          description: "Validate the workspace AI summary flow.",
          status: "IN_PROGRESS",
          priority: "MEDIUM",
          labels: [],
          tags: ["ai"],
          checklist: [{ id: "check-1", label: "Run regression", done: true }],
          dueDate,
          timeEstimate: 60,
          actualTime: 1,
          createdAt: now,
          updatedAt: now,
          customFields: {
            progress: 40,
            notes: [{ body: "Fixed activity summary retrieval.", createdAt: now.toISOString() }]
          }
        }
      ]
    },
    ticket: { findMany: async () => [] },
    note: {
      findMany: async () => [{
        id: "note-1",
        title: "Implementation note",
        content: "Documented the monthly work summary behavior.",
        tags: ["ai"],
        createdAt: now,
        updatedAt: now
      }]
    },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] },
    timeEntry: {
      findMany: async () => [{
        id: "time-1",
        title: "Focus: Test task",
        taskId: "task-1",
        status: "STOPPED",
        startedAt: now,
        durationSec: 70,
        durationMin: 1,
        task: { id: "task-1", title: "Test task", status: "IN_PROGRESS", priority: "MEDIUM" }
      }]
    }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  let requestedBody = "";
  globalThis.fetch = async (_input, init) => {
    fetchCalled = true;
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "## Activity Summary\nYou worked on Test task and documented the Implementation note, with 1m 10s recorded this month. [S1] [S2] [S3]" } }] }), { status: 200 });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "Summerize what I have worked this month");

    assert.equal(fetchCalled, true);
    assert.equal(result.sufficientContext, true);
    assert.equal(result.provider, "groq");
    assert.match(result.content, /^## Activity Summary/);
    assert.match(result.content, /1m 10s/);
    assert.match(result.content, /Test task/);
    assert.match(result.content, /Implementation note/);
    const providerPrompt = JSON.parse(requestedBody).messages.find((message: { role: string }) => message.role === "user")?.content as string;
    assert.match(providerPrompt, /Original user prompt: Summerize what I have worked this month/);
    assert.match(providerPrompt, /RAG retrieval brief/);
    assert.match(providerPrompt, /Detected intent: activity-summary/);
    assert.match(providerPrompt, /Authoritative tracked time: 1m 10s this month/);
    assert.ok(result.sources.some((source) => source.type === "Time Entry" && source.facts?.durationSec === 70));
    assert.ok(result.sources.some((source) => source.type === "Task" && source.title === "Test task"));
    assert.ok(result.sources.some((source) => source.type === "Note" && source.title === "Implementation note"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask answers task progress from the exact task source", async () => {
  const now = new Date();
  const overdueDate = new Date(now);
  overdueDate.setDate(now.getDate() - 2);
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: {
      findMany: async () => [{
        id: "article-1",
        title: "Knowledge draft: MW-5062: Another Test",
        problem: "MW-5062: Another Test",
        rootCause: "To be documented during investigation.",
        resolution: "To be updated when the ticket is resolved.",
        tags: ["ticket", "auto-linked"],
        references: ["Ticket: 5062", "Task: MW-5062: Another Test"],
        createdAt: now,
        updatedAt: now
      }]
    },
    task: {
      findMany: async () => [
        {
          id: "task-1",
          title: "Test task",
          description: "Captured from What's Next?",
          status: "IN_PROGRESS",
          priority: "MEDIUM",
          labels: [],
          tags: [],
          checklist: [{ id: "check-1", label: "Review setup", done: true }, { id: "check-2", label: "Finish validation", done: false }],
          dueDate: overdueDate,
          timeEstimate: 90,
          actualTime: 30,
          createdAt: now,
          updatedAt: now,
          customFields: {
            progress: 50,
            notes: [{ body: "Initial setup has been validated.", createdAt: now.toISOString() }]
          }
        },
        {
          id: "task-2",
          title: "MW-5062: Another Test",
          description: "Captured from What's Next?",
          status: "TODO",
          priority: "MEDIUM",
          labels: ["ticket"],
          tags: ["ticket"],
          checklist: [],
          dueDate: now,
          timeEstimate: 60,
          actualTime: 0,
          createdAt: now,
          updatedAt: now,
          customFields: { workType: "Ticket", ticketNumber: "5062", customer: "Internal", severity: "Medium" }
        }
      ]
    },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: "Provider should not be called." } }] }), { status: 200 });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "What work has been done in the \"Test task\" task");

    assert.equal(fetchCalled, false);
    assert.equal(result.sufficientContext, true);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].title, "Test task");
    assert.match(result.content, /50% progress/);
    assert.match(result.content, /1\/2 checklist items done/);
    assert.match(result.content, /30 minutes tracked/);
    assert.match(result.content, /Initial setup has been validated/);
    assert.doesNotMatch(result.content, /MW-5062/);
    assert.doesNotMatch(result.content, /Knowledge draft/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask leads latest-update questions with the latest task note", async () => {
  const now = new Date("2026-07-04T08:30:00.000Z");
  const older = new Date("2026-07-03T08:30:00.000Z");
  const dueDate = new Date("2026-07-16T00:00:00.000Z");
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: { findMany: async () => [] },
    task: {
      findMany: async () => [
        {
          id: "task-ticket",
          title: "MW-5062: Another Test",
          description: "Captured from What's Next?",
          status: "TODO",
          priority: "MEDIUM",
          labels: ["ticket"],
          tags: ["ticket"],
          checklist: [],
          dueDate,
          timeEstimate: 60,
          actualTime: 0,
          createdAt: older,
          updatedAt: now,
          customFields: {
            workType: "Ticket",
            ticketNumber: "5062",
            customer: "Internal",
            severity: "Medium",
            progress: 0,
            notes: [
              { body: "Initial investigation started.", createdAt: older.toISOString() },
              { body: "Need to wait for the factory to provide the file", createdAt: now.toISOString() }
            ]
          }
        }
      ]
    },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: { findMany: async () => [] }
  };
  const config = {
    get: () => undefined
  };
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: "Provider should not be called." } }] }), { status: 200 });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "What was the last update on the Another Test task");

    assert.equal(fetchCalled, false);
    assert.equal(result.sufficientContext, true);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].title, "5062 MW-5062: Another Test");
    assert.equal(result.sources[0].facts?.latestNote, "Need to wait for the factory to provide the file");
    assert.match(result.content, /^## Latest Update/);
    assert.match(result.content, /Need to wait for the factory to provide the file/);
    assert.doesNotMatch(result.content, /^## Summary/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AiService grounded workspace ask understands this-week task questions", async () => {
  const now = new Date();
  const prisma = {
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    aiMessage: {
      create: async () => ({ id: "message-id" })
    },
    knowledgeArticle: {
      findMany: async () => [{
        id: "article-1",
        title: "Knowledge draft: unrelated ticket",
        problem: "Draft created this week for a different ticket.",
        rootCause: "To be documented.",
        resolution: "To be updated.",
        tags: ["ticket", "auto-linked"],
        references: ["Ticket: 5062"],
        createdAt: now,
        updatedAt: now
      }]
    },
    task: {
      findMany: async () => [{
        id: "task-1",
        title: "Send weekly rollout report",
        description: "Prepare the customer-facing rollout update.",
        status: "TODO",
        priority: "HIGH",
        labels: [],
        tags: ["reporting"],
        dueDate: now,
        createdAt: now,
        updatedAt: now,
        customFields: {}
      }]
    },
    ticket: { findMany: async () => [] },
    note: { findMany: async () => [] },
    sqlSnippet: { findMany: async () => [] },
    fileAsset: {
      findMany: async () => [{
        id: "file-1",
        name: "recent-logo.png",
        mimeType: "image/png",
        size: 1200,
        entityType: "Task",
        entityId: "task-1",
        createdAt: now
      }]
    }
  };
  const configValues: Record<string, string> = {
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "gsk-real-test-key",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.1-8b-instant"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const originalFetch = globalThis.fetch;
  let requestedBody = "";
  globalThis.fetch = async (_input, init) => {
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "This week includes the rollout report task [S1]." } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const service = new AiService(prisma as never, config as never);
    const result = await service.askWorkspace("user-id", "baa8bc03-ce34-43a6-bb3e-4a96dde56685", "Tasks this week");
    const body = JSON.parse(requestedBody);
    const userPrompt = body.messages.find((message: { role: string }) => message.role === "user")?.content as string;

    assert.equal(result.sufficientContext, true);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].type, "Task");
    assert.match(userPrompt, /due this week/);
    assert.match(userPrompt, /Send weekly rollout report/);
    assert.doesNotMatch(userPrompt, /Knowledge draft: unrelated ticket/);
    assert.doesNotMatch(userPrompt, /recent-logo\.png/);
    assert.doesNotMatch(userPrompt, /Record id:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

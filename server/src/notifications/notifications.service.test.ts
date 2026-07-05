import assert from "node:assert/strict";
import test from "node:test";
import { NotificationsService } from "./notifications.service";

test("NotificationsService sends daily summary emails with an AI-generated briefing", async () => {
  const aiCalls: Array<{ userId: string; prompt: string; systemPrompt: string }> = [];
  const sentEmails: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    sentEmails.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ id: "email-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const prisma = {
    workspaceMember: {
      findUnique: async () => ({ id: "membership-id" })
    },
    user: {
      findUniqueOrThrow: async () => ({ email: "user@example.com", name: "Ash" })
    },
    workspace: {
      findUniqueOrThrow: async () => ({ name: "Support" })
    },
    task: {
      findMany: async () => [
        {
          title: "MW-5062: Another Test",
          description: "Factory file is required before the ticket can move.",
          status: "TODO",
          priority: "MEDIUM",
          dueDate: new Date("2026-07-16T00:00:00.000Z"),
          timeEstimate: 60,
          actualTime: 0,
          updatedAt: new Date("2026-07-05T08:00:00.000Z"),
          customFields: {
            progress: 0,
            severity: "Medium",
            customer: "Internal",
            notes: [{ body: "Need to wait for the factory to provide the file", createdAt: "Jul 5, 09:00 AM" }]
          }
        }
      ]
    },
    timeEntry: {
      findMany: async () => [
        {
          title: "MW-5062: Another Test",
          durationMin: 1,
          durationSec: 75,
          status: "STOPPED",
          startedAt: new Date("2026-07-05T07:45:00.000Z"),
          task: { title: "MW-5062: Another Test", status: "TODO", priority: "MEDIUM" }
        }
      ]
    },
    notification: {
      create: async () => ({ id: "notification-id" })
    }
  };
  const config = {
    get: (key: string, fallback?: string) => ({
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "What's Next? <noreply@example.com>"
    }[key] ?? fallback)
  };
  const ai = {
    generateText: async (userId: string, prompt: string, systemPrompt: string) => {
      aiCalls.push({ userId, prompt, systemPrompt });
      return {
        content: "## Top focus\nFollow up with the factory on the missing file.\n\n## Next actions\n- Ask for ETA\n- Keep MW-5062 in Todo until the file arrives",
        providerLabel: "Groq",
        model: "llama-3.1-8b-instant"
      };
    }
  };

  try {
    const service = new NotificationsService(prisma as never, config as never, ai as never);
    const result = await service.sendDailySummary("user-id", "workspace-id");

    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].userId, "user-id");
    assert.match(aiCalls[0].systemPrompt, /daily workspace briefing assistant/);
    assert.match(aiCalls[0].prompt, /Latest progress note: Need to wait for the factory/);
    assert.match(result.body, /AI daily briefing \(Groq \/ llama-3\.1-8b-instant\)/);
    assert.match(String(sentEmails[0].html), /AI daily briefing/);
    assert.match(String(sentEmails[0].html), /Follow up with the factory/);
    assert.match(String(sentEmails[0].text), /Ask for ETA/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

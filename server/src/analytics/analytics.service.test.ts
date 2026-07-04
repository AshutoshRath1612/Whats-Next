import assert from "node:assert/strict";
import test from "node:test";
import { AnalyticsService } from "./analytics.service";

test("AnalyticsService includes open and due task activity in dashboard analytics", async () => {
  const now = new Date();
  const service = new AnalyticsService({
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    task: {
      findMany: async () => [{
        status: "TODO",
        priority: "HIGH",
        dueDate: now,
        createdAt: now,
        updatedAt: now,
        customFields: { workType: "Ticket" }
      }]
    },
    project: { findMany: async () => [] },
    ticket: { count: async () => 0 },
    note: { findMany: async () => [] },
    timeEntry: { findMany: async () => [] }
  } as never);

  const result = await service.dashboard("user-id", "workspace-id");

  assert.equal(result.counts.openTasks, 1);
  assert.equal(result.counts.completedTasks, 0);
  assert.equal(result.counts.dueThisWeek, 1);
  assert.equal(result.counts.tickets, 1);
  assert.ok(result.weeklyProgress.some((day) => day.created === 1 || day.due === 1 || day.open === 1));
});

test("AnalyticsService reports focused seconds so short sessions are visible", async () => {
  const now = new Date();
  const service = new AnalyticsService({
    workspaceMember: { findUnique: async () => ({ id: "member-id" }) },
    task: { findMany: async () => [] },
    project: { findMany: async () => [] },
    ticket: { count: async () => 0 },
    note: { findMany: async () => [] },
    timeEntry: {
      findMany: async (input: { select?: unknown }) => input.select
        ? [{ createdAt: now, durationMin: 0, durationSec: 52, status: "STOPPED", startedAt: now }]
        : []
    }
  } as never);

  const result = await service.dashboard("user-id", "workspace-id");
  const today = result.weeklyProgress.find((day) => day.focusedSeconds === 52);

  assert.equal(today?.focusedSeconds, 52);
  assert.equal(today?.focusedMinutes, 0);
});

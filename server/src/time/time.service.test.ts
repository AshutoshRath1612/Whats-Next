import assert from "node:assert/strict";
import test from "node:test";
import { TimeService } from "./time.service";

test("TimeService preserves sub-minute durations when stopping a running timer", async () => {
  const startedAt = new Date("2026-07-04T10:00:00.000Z");
  const stoppedAt = new Date(startedAt.getTime() + 52_000);
  const originalDateNow = Date.now;
  Date.now = () => stoppedAt.getTime();
  let updateData: { durationSec?: unknown; durationMin?: unknown; status?: unknown } | undefined;
  const service = new TimeService({
    timeEntry: {
      findFirst: async () => ({
        id: "timer-id",
        userId: "user-id",
        workspaceId: "workspace-id",
        taskId: null,
        title: "Focused work",
        status: "RUNNING",
        startedAt,
        endedAt: null,
        durationMin: 0,
        durationSec: 0,
        createdAt: startedAt
      }),
      update: async (input: { data: Record<string, unknown> }) => {
        updateData = input.data;
        return { id: "timer-id", ...input.data };
      }
    }
  } as never);

  try {
    await service.stop("user-id", "timer-id");
    assert.ok(updateData);
    assert.equal(updateData.durationSec, 52);
    assert.equal(updateData.durationMin, 0);
    assert.equal(updateData.status, "STOPPED");
  } finally {
    Date.now = originalDateNow;
  }
});

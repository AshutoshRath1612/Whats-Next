import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatedLogPath } from "./logging/api-logger.service";

test("resolveDatedLogPath prefixes relative log files with the request date", () => {
  const path = resolveDatedLogPath("logs/api-flow.log", new Date("2026-07-04T10:20:30.000Z"), "/app/server");

  assert.equal(path, "/app/server/logs/2026-07-04_api-flow.log");
});

test("resolveDatedLogPath preserves absolute log directories", () => {
  const path = resolveDatedLogPath("/var/log/whats-next/api-flow.log", new Date("2026-07-05T00:00:00.000Z"), "/app/server");

  assert.equal(path, "/var/log/whats-next/2026-07-05_api-flow.log");
});

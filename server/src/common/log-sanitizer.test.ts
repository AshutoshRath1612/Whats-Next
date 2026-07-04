import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeForLog } from "./logging/log-sanitizer";

test("sanitizeForLog redacts secrets and summarizes large payload fields", () => {
  const sanitized = sanitizeForLog({
    email: "user@example.com",
    password: "super-secret",
    authorization: "Bearer token",
    fileData: "x".repeat(5_000),
    nested: {
      apiKey: "key",
      value: "safe"
    }
  }) as Record<string, unknown>;

  assert.equal(sanitized.email, "user@example.com");
  assert.equal(sanitized.password, "[Redacted]");
  assert.equal(sanitized.authorization, "[Redacted]");
  assert.equal(sanitized.fileData, "[Redacted large payload: 5000 chars]");
  assert.deepEqual(sanitized.nested, { apiKey: "[Redacted]", value: "safe" });
});

test("sanitizeForLog converts undefined values to JSON-safe nulls", () => {
  const sanitized = sanitizeForLog({
    durationMs: undefined,
    args: ["workspace-id", undefined],
    nested: { value: undefined }
  });

  assert.deepEqual(sanitized, {
    durationMs: null,
    args: ["workspace-id", null],
    nested: { value: null }
  });
});

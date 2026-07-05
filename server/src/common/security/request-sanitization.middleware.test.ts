import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeRequestValue } from "./request-sanitization.middleware";

test("sanitizeRequestValue removes prototype pollution keys recursively", () => {
  const sanitized = sanitizeRequestValue({
    title: "Task",
    nested: {
      "__proto__": { polluted: true },
      constructor: "blocked",
      safe: "kept"
    },
    list: [{ prototype: "blocked", value: "kept" }]
  });

  assert.deepEqual(sanitized, {
    title: "Task",
    nested: { safe: "kept" },
    list: [{ value: "kept" }]
  });
});

test("sanitizeRequestValue removes unsafe control characters without stripping markdown or SQL", () => {
  const sanitized = sanitizeRequestValue({
    note: "# Heading\nselect * from users where email = '<user@example.com>';\u0000\u0008",
    spoofed: "safe\u202Etxt"
  });

  assert.deepEqual(sanitized, {
    note: "# Heading\nselect * from users where email = '<user@example.com>';",
    spoofed: "safetxt"
  });
});

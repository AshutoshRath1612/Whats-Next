import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("seed script does not create sample workspace data", () => {
  const source = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
  assert.doesNotMatch(source, /prisma\.user\.upsert/);
  assert.doesNotMatch(source, /prisma\.workspace\.upsert/);
  assert.doesNotMatch(source, /sample@/i);
  assert.doesNotMatch(source, /Sample Workspace/);
});

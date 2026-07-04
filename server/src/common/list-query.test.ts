import assert from "node:assert/strict";
import test from "node:test";
import { parseListQuery } from "./list-query";

test("parseListQuery applies defaults", () => {
  assert.deepEqual(parseListQuery({}), {
    q: undefined,
    skip: 0,
    take: 50,
    sortBy: undefined,
    sortDir: "desc"
  });
});

test("parseListQuery clamps page size and computes skip", () => {
  assert.deepEqual(parseListQuery({ page: "3", pageSize: "250", sortBy: "updatedAt", sortDir: "asc", q: "workspace" }), {
    q: "workspace",
    skip: 200,
    take: 100,
    sortBy: "updatedAt",
    sortDir: "asc"
  });
});

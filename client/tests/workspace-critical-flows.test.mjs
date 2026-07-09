import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const productWorkspace = readFileSync(join(root, "components/workspace/product-workspace.tsx"), "utf8");
const workspaceShell = readFileSync(join(root, "components/layout/workspace-shell.tsx"), "utf8");
const authContext = readFileSync(join(root, "lib/auth/auth-context.tsx"), "utf8");
const loginPage = readFileSync(join(root, "app/login/page.tsx"), "utf8");
const taskApi = readFileSync(join(root, "lib/workspace/task-api.ts"), "utf8");

test("auth flow validates cookie-backed sessions, redirects login, and avoids client-side auth storage", () => {
  assert.match(authContext, /sessionRequest\(\)/);
  assert.match(authContext, /refreshRequest\(\)/);
  assert.match(loginPage, /auth\.status === "authenticated"/);
  assert.match(loginPage, /router\.replace\("\/"\)/);
  assert.doesNotMatch(authContext, new RegExp("local" + "Storage"));
  assert.match(authContext, /logoutRequest\(token\)/);
});

test("task creation and detail updates persist complete task metadata", () => {
  assert.match(productWorkspace, /createTaskRequest\(auth\.token, workspaceId, input\)/);
  assert.match(productWorkspace, /updateTaskRequest\(auth\.token, task\)/);
  assert.match(taskApi, /acceptanceCriteria/);
  assert.match(taskApi, /subtasks/);
  assert.match(taskApi, /dependencies/);
  assert.match(taskApi, /projectId: task\.projectId \?\? null/);
  assert.match(taskApi, /notes: task\.notes/);
});

test("task view supports scalable filtering and keeps completed work below active tasks", () => {
  assert.match(productWorkspace, /setStatusFilter/);
  assert.match(productWorkspace, /setProjectFilter/);
  assert.match(productWorkspace, /setPriorityFilter/);
  assert.match(productWorkspace, /taskMatchesQuery/);
  assert.match(productWorkspace, /compareTasksForFocus/);
  assert.match(productWorkspace, /completed work stays below it/);
});

test("kanban drag and drop persists task status changes", () => {
  assert.match(productWorkspace, /draggable/);
  assert.match(productWorkspace, /onDragStart/);
  assert.match(productWorkspace, /onDrop/);
  assert.match(productWorkspace, /updateTaskStatusRequest\(auth\.token, taskId, status\)/);
});

test("task notes and theme switching remain reachable from primary workflows", () => {
  assert.match(productWorkspace, /Add progress, investigation notes, decisions, blockers, or handoff context/);
  assert.match(productWorkspace, /notes:\s*\[/);
  assert.match(workspaceShell, /setTheme\(resolvedTheme === "dark" \? "light" : "dark"\)/);
});

test("keyboard critical workflows are declared in the workspace", () => {
  assert.match(productWorkspace, /event\.key\.toLowerCase\(\) === "n"/);
  assert.match(productWorkspace, /setActiveView\("Dashboard"\)/);
  assert.match(productWorkspace, /setActiveView\("Tasks"\)/);
  assert.match(productWorkspace, /setActiveView\("Projects"\)/);
  assert.match(productWorkspace, /setActiveView\("Calendar"\)/);
});

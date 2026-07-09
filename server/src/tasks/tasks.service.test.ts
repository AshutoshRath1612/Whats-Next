import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { TasksService } from "./tasks.service";

test("TasksService denies list access outside workspace membership", async () => {
  const service = new TasksService({
    workspaceMember: { findUnique: async () => null }
  } as never);

  await assert.rejects(
    () => service.list("user-1", "workspace-1", { skip: 0, take: 20, sortDir: "desc" }),
    ForbiddenException
  );
});

test("TasksService creates task only when project belongs to workspace", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const service = new TasksService({
    workspaceMember: { findUnique: async () => ({ id: "member-1" }) },
    project: { findFirst: async () => null },
    task: { create: async (value: unknown) => { calls.push({ name: "task.create", value }); return { id: "task-1", workspaceId: "workspace-1" }; } },
    auditLog: { create: async () => ({}) }
  } as never);

  await assert.rejects(
    () => service.create("user-1", {
      workspaceId: "workspace-1",
      projectId: "wrong-project",
      title: "Blocked task",
      priority: "HIGH",
      status: "TODO"
    }),
    BadRequestException
  );
  assert.equal(calls.length, 0);
});

test("TasksService persists rich task custom fields and checklist data", async () => {
  let createInput: any;
  const service = new TasksService({
    workspaceMember: { findUnique: async () => ({ id: "member-1" }) },
    task: {
      create: async (input: unknown) => {
        createInput = input;
        return { id: "task-1", workspaceId: "workspace-1" };
      }
    },
    auditLog: { create: async () => ({}) }
  } as never);

  await service.create("user-1", {
    workspaceId: "workspace-1",
    title: "Create rich task",
    priority: "URGENT",
    status: "TODO",
    checklist: [{ id: "check-1", label: "Verify", done: false }],
    dueDate: "2026-07-01",
    customFields: { notes: [{ id: "note-1", body: "Progress note" }], acceptanceCriteria: "Done means verified" }
  });

  assert.equal(createInput.data.priority, "URGENT");
  assert.deepEqual(createInput.data.checklist, [{ id: "check-1", label: "Verify", done: false }]);
  assert.equal(createInput.data.customFields.acceptanceCriteria, "Done means verified");
  assert.ok(createInput.data.dueDate instanceof Date);
});

test("TasksService updates and clears task project assignment", async () => {
  const projectLookups: Array<{ id: string; workspaceId: string }> = [];
  const updates: any[] = [];
  const service = new TasksService({
    workspaceMember: { findUnique: async () => ({ id: "member-1" }) },
    project: {
      findFirst: async ({ where }: any) => {
        projectLookups.push({ id: where.id, workspaceId: where.workspaceId });
        return { id: where.id };
      }
    },
    task: {
      findFirst: async () => ({ id: "task-1", workspaceId: "workspace-1" }),
      update: async (input: unknown) => {
        updates.push(input);
        return { id: "task-1", workspaceId: "workspace-1" };
      }
    },
    auditLog: { create: async () => ({}) }
  } as never);

  await service.update("user-1", "task-1", { projectId: "project-1" });
  await service.update("user-1", "task-1", { projectId: null });

  assert.deepEqual(projectLookups, [{ id: "project-1", workspaceId: "workspace-1" }]);
  assert.deepEqual(updates[0].data.project, { connect: { id: "project-1" } });
  assert.deepEqual(updates[1].data.project, { disconnect: true });
});

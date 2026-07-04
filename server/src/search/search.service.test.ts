import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { SearchService } from "./search.service";

test("SearchService requires a workspace id", async () => {
  const service = new SearchService({} as never);
  await assert.rejects(() => service.global("user-1", "", "task"), BadRequestException);
});

test("SearchService enforces workspace membership", async () => {
  const service = new SearchService({
    workspaceMember: { findUnique: async () => null }
  } as never);
  await assert.rejects(() => service.global("user-1", "workspace-1", "task"), ForbiddenException);
});

test("SearchService searches every primary workspace collection", async () => {
  const service = new SearchService({
    workspaceMember: { findUnique: async () => ({ id: "member-1" }) },
    task: { findMany: async () => [{ id: "task-1", title: "Task", status: "TODO" }] },
    project: { findMany: async () => [{ id: "project-1", name: "Project", status: "active" }] },
    note: { findMany: async () => [{ id: "note-1", title: "Note", format: "markdown" }] },
    ticket: { findMany: async () => [{ id: "ticket-1", title: "Ticket", ticketNumber: "NX-1" }] },
    sqlSnippet: { findMany: async () => [{ id: "sql-1", title: "SQL", folder: "Ops" }] },
    knowledgeArticle: { findMany: async () => [{ id: "article-1", title: "Article" }] },
    fileAsset: { findMany: async () => [{ id: "file-1", name: "Runbook.pdf", entityType: "Task", mimeType: "application/pdf" }] },
    template: { findMany: async () => [{ id: "template-1", name: "Status update", category: "Email" }] },
    calendarEvent: { findMany: async () => [{ id: "event-1", title: "Planning", startsAt: new Date("2026-06-29T09:00:00.000Z") }] }
  } as never);

  const results = await service.global("user-1", "workspace-1", "whats next");
  assert.deepEqual(results.map((item) => item.type), ["task", "project", "note", "ticket", "sql", "article", "file", "template", "calendar"]);
});

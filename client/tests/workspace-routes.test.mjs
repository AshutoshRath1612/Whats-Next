import assert from "node:assert/strict";
import test from "node:test";

const viewToModuleSlug = {
  Dashboard: "",
  Tasks: "tasks",
  Projects: "projects",
  Tickets: "tickets",
  "Knowledge Base": "knowledge-base",
  Notes: "notes",
  "SQL Library": "sql-library",
  Calendar: "calendar",
  "Time Tracker": "time-tracker",
  Files: "files",
  Templates: "templates",
  Analytics: "analytics",
  Personal: "personal",
  Gaming: "gaming",
  Settings: "settings"
};

test("workspace route map keeps each module reachable by a unique path", () => {
  const slugs = Object.values(viewToModuleSlug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(viewToModuleSlug.Tasks, "tasks");
  assert.equal(viewToModuleSlug["Knowledge Base"], "knowledge-base");
  assert.equal(viewToModuleSlug["Time Tracker"], "time-tracker");
});

test("dashboard remains the root workspace route", () => {
  assert.equal(viewToModuleSlug.Dashboard, "");
});

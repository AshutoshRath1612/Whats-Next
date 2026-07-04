import { WorkspaceView } from "./types";

export const workspaceViews: WorkspaceView[] = [
  "Dashboard",
  "Workspace",
  "Tasks",
  "Projects",
  "Tickets",
  "Knowledge Base",
  "Notes",
  "SQL Library",
  "Calendar",
  "Time Tracker",
  "Files",
  "Templates",
  "Analytics",
  "Personal",
  "Gaming",
  "Settings"
];

export const viewToModuleSlug: Record<WorkspaceView, string> = {
  Dashboard: "",
  Workspace: "workspace",
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

export const moduleSlugToView = Object.fromEntries(
  Object.entries(viewToModuleSlug).map(([view, slug]) => [slug, view])
) as Record<string, WorkspaceView>;

export function parseWorkspaceView(value: string | null): WorkspaceView | null {
  return value && workspaceViews.includes(value as WorkspaceView) ? (value as WorkspaceView) : null;
}

export function parseWorkspaceModuleSlug(value: string | null): WorkspaceView | null {
  if (!value) return "Dashboard";
  return moduleSlugToView[value] ?? null;
}

export function getWorkspacePath(view: WorkspaceView) {
  const slug = viewToModuleSlug[view];
  return slug ? `/${slug}` : "/";
}

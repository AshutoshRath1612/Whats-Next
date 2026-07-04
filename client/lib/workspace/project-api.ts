import { Project } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiProject = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  coverUrl?: string | null;
  color?: string | null;
  progress?: number;
  dueDate?: string | null;
  isPinned?: boolean;
  status?: string | null;
  deletedAt?: string | null;
};

export type CreateProjectInput = Pick<Project, "name" | "description" | "due"> & Partial<Pick<Project, "icon" | "coverUrl" | "color">>;
export type UpdateProjectInput = Pick<Project, "id" | "name" | "description" | "due" | "icon" | "coverUrl" | "color" | "progress" | "pinned">;

async function projectRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message ?? "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export function mapApiProject(project: ApiProject): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? "",
    icon: project.icon ?? "folder-kanban",
    coverUrl: project.coverUrl ?? "",
    color: project.color ?? "#4F46E5",
    progress: project.progress ?? 0,
    due: project.dueDate ? project.dueDate.slice(0, 10) : "TBD",
    pinned: project.isPinned ?? false,
    archived: project.status === "archived" || Boolean(project.deletedAt),
    milestones: []
  };
}

export function listProjectsRequest(token: string | null | undefined, workspaceId: string, includeArchived = false) {
  const params = new URLSearchParams({ workspaceId });
  if (includeArchived) params.set("includeArchived", "true");
  return projectRequest<ApiProject[]>(`/projects?${params.toString()}`, token);
}

export function createProjectRequest(token: string | null | undefined, workspaceId: string, input: CreateProjectInput) {
  return projectRequest<ApiProject>("/projects", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      name: input.name,
      description: input.description,
      icon: input.icon,
      coverUrl: input.coverUrl,
      color: input.color,
      dueDate: input.due && input.due !== "TBD" ? input.due : undefined
    })
  });
}

export function updateProjectRequest(token: string | null | undefined, project: UpdateProjectInput) {
  return projectRequest<ApiProject>(`/projects/${project.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      name: project.name,
      description: project.description,
      icon: project.icon,
      coverUrl: project.coverUrl,
      color: project.color,
      progress: project.progress,
      isPinned: project.pinned,
      dueDate: project.due && project.due !== "TBD" ? project.due : undefined
    })
  });
}

export function archiveProjectRequest(token: string | null | undefined, projectId: string) {
  return projectRequest<ApiProject>(`/projects/${projectId}`, token, { method: "DELETE" });
}

export function unarchiveProjectRequest(token: string | null | undefined, projectId: string) {
  return projectRequest<ApiProject>(`/projects/${projectId}/unarchive`, token, { method: "PATCH" });
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  _count?: {
    projects: number;
    tasks: number;
    notes: number;
    tickets: number;
  };
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function workspaceRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function listWorkspacesRequest(token?: string | null) {
  return workspaceRequest<WorkspaceSummary[]>("/workspaces", token);
}

export function createWorkspaceRequest(token: string | null | undefined, input: { name: string; slug: string; icon?: string; color?: string }) {
  return workspaceRequest<WorkspaceSummary>("/workspaces", token, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateWorkspaceRequest(token: string | null | undefined, workspaceId: string, input: { name?: string; slug?: string; icon?: string; color?: string }) {
  return workspaceRequest<WorkspaceSummary>(`/workspaces/${workspaceId}`, token, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function archiveWorkspaceRequest(token: string | null | undefined, workspaceId: string) {
  return workspaceRequest<WorkspaceSummary>(`/workspaces/${workspaceId}`, token, { method: "DELETE" });
}

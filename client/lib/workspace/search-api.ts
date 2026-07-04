const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type GlobalSearchResult = {
  type: "task" | "project" | "note" | "ticket" | "sql" | "article" | "file" | "template" | "calendar";
  id: string;
  title: string;
  subtitle: string;
};

async function searchRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function globalSearchRequest(token: string | null | undefined, workspaceId: string, query: string) {
  const params = new URLSearchParams({ workspaceId, q: query });
  return searchRequest<GlobalSearchResult[]>(`/search?${params.toString()}`, token);
}

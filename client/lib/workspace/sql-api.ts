import { SqlSnippet } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiSqlSnippet = {
  id: string;
  title: string;
  description?: string | null;
  query: string;
  databaseTags?: string[];
  folder?: string | null;
  executionNotes?: string | null;
  isFavorite?: boolean;
};

export type CreateSqlSnippetInput = Pick<SqlSnippet, "title" | "description" | "query" | "folder"> &
  Partial<Pick<SqlSnippet, "executionNotes" | "favorite" | "tags">>;

async function sqlRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function mapApiSqlSnippet(snippet: ApiSqlSnippet): SqlSnippet {
  return {
    id: snippet.id,
    title: snippet.title,
    description: snippet.description ?? "",
    query: snippet.query,
    folder: snippet.folder ?? "General",
    executionNotes: snippet.executionNotes ?? "",
    favorite: snippet.isFavorite ?? false,
    tags: snippet.databaseTags ?? [],
    history: []
  };
}

export function listSqlSnippetsRequest(token: string | null | undefined, workspaceId: string) {
  return sqlRequest<ApiSqlSnippet[]>(`/sql?workspaceId=${encodeURIComponent(workspaceId)}`, token);
}

export function createSqlSnippetRequest(token: string | null | undefined, workspaceId: string, input: CreateSqlSnippetInput) {
  return sqlRequest<ApiSqlSnippet>("/sql", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      title: input.title,
      description: input.description,
      query: input.query,
      folder: input.folder,
      databaseTags: input.tags ?? [],
      executionNotes: input.executionNotes,
      isFavorite: input.favorite ?? false
    })
  });
}

export function updateSqlSnippetRequest(token: string | null | undefined, snippet: SqlSnippet) {
  return sqlRequest<ApiSqlSnippet>(`/sql/${snippet.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      title: snippet.title,
      description: snippet.description,
      query: snippet.query,
      folder: snippet.folder,
      databaseTags: snippet.tags,
      executionNotes: snippet.executionNotes,
      isFavorite: snippet.favorite
    })
  });
}

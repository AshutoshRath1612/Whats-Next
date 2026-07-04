import { Note } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiNote = {
  id: string;
  projectId?: string | null;
  title: string;
  content: string;
  tags?: string[];
  isPinned?: boolean;
  updatedAt?: string;
  versions?: ApiNoteVersion[];
};

export type ApiNoteVersion = {
  id: string;
  projectId?: string | null;
  title: string;
  content: string;
  tags?: string[];
  isPinned?: boolean;
  savedAt?: string;
};

export type CreateNoteInput = Pick<Note, "title" | "content" | "tags"> & Partial<Pick<Note, "projectId" | "pinned">>;

async function noteRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function mapApiNote(note: ApiNote): Note {
  return {
    id: note.id,
    projectId: note.projectId ?? undefined,
    title: note.title,
    content: note.content,
    tags: note.tags ?? [],
    pinned: note.isPinned ?? false,
    updatedAt: note.updatedAt ? new Date(note.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric" }) : "Recently",
    versions: (note.versions ?? []).map((version) => ({
      id: version.id,
      projectId: version.projectId ?? undefined,
      title: version.title,
      content: version.content,
      tags: version.tags ?? [],
      pinned: version.isPinned ?? false,
      savedAt: version.savedAt ? new Date(version.savedAt).toLocaleString() : "Saved version"
    }))
  };
}

export function listNotesRequest(token: string | null | undefined, workspaceId: string) {
  return noteRequest<ApiNote[]>(`/notes?workspaceId=${encodeURIComponent(workspaceId)}`, token);
}

export function createNoteRequest(token: string | null | undefined, workspaceId: string, input: CreateNoteInput) {
  return noteRequest<ApiNote>("/notes", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      projectId: input.projectId,
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      isPinned: input.pinned ?? false
    })
  });
}

export function updateNoteRequest(token: string | null | undefined, note: Note) {
  return noteRequest<ApiNote>(`/notes/${note.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      projectId: note.projectId,
      title: note.title,
      content: note.content,
      tags: note.tags,
      isPinned: note.pinned
    })
  });
}

import { TimeEntry } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiTimeEntry = {
  id: string;
  workspaceId?: string;
  taskId?: string | null;
  title: string;
  status: "RUNNING" | "PAUSED" | "STOPPED";
  startedAt: string;
  durationMin: number;
  durationSec?: number;
};

async function timeRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function mapApiTimeEntry(entry: ApiTimeEntry): TimeEntry {
  return {
    id: entry.id,
    title: entry.title,
    taskId: entry.taskId ?? undefined,
    status: entry.status === "RUNNING" ? "Running" : entry.status === "PAUSED" ? "Paused" : "Stopped",
    startedAt: new Date(entry.startedAt).getTime(),
    elapsedSeconds: Math.max(0, typeof entry.durationSec === "number" ? entry.durationSec : entry.durationMin * 60)
  };
}

export function listTimeEntriesRequest(token: string | null | undefined, workspaceId: string) {
  return timeRequest<ApiTimeEntry[]>(`/time?workspaceId=${encodeURIComponent(workspaceId)}`, token);
}

export function startTimeEntryRequest(token: string | null | undefined, workspaceId: string, title: string, taskId?: string) {
  return timeRequest<ApiTimeEntry>("/time/start", token, {
    method: "POST",
    body: JSON.stringify({ workspaceId, title, taskId })
  });
}

export function manualTimeEntryRequest(token: string | null | undefined, workspaceId: string, title: string, minutes: number, taskId?: string) {
  return timeRequest<ApiTimeEntry>("/time/manual", token, {
    method: "POST",
    body: JSON.stringify({ workspaceId, title, minutes, taskId })
  });
}

export function toggleTimeEntryRequest(token: string | null | undefined, timerId: string) {
  return timeRequest<ApiTimeEntry>(`/time/${timerId}/toggle`, token, { method: "PATCH" });
}

export function stopTimeEntryRequest(token: string | null | undefined, timerId: string) {
  return timeRequest<ApiTimeEntry>(`/time/${timerId}/stop`, token, { method: "PATCH" });
}

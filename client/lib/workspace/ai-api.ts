const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type WorkspaceAiSource = {
  sourceId: string;
  type: "Knowledge Article" | "Task" | "Ticket" | "Note" | "SQL Snippet" | "File" | "Time Entry";
  id: string;
  title: string;
  summary: string;
  score: number;
  facts?: {
    createdAt?: string;
    status?: string;
    priority?: string;
    progressPercent?: number;
    checklistDone?: number;
    checklistTotal?: number;
    actualMinutes?: number;
    estimateMinutes?: number;
    startDate?: string;
    dueDate?: string;
    updatedAt?: string;
    isOverdue?: boolean;
    daysOverdue?: number;
    isDueToday?: boolean;
    isDueThisWeek?: boolean;
    isDueThisMonth?: boolean;
    workState?: "open" | "closed";
    description?: string;
    ticketNumber?: string;
    customer?: string;
    severity?: string;
    investigation?: string;
    resolution?: string;
    closureNotes?: string;
    acceptanceCriteria?: string;
    notes?: string;
    latestNote?: string;
    latestNoteAt?: string;
    durationSec?: number;
    durationMin?: number;
    timeEntryCount?: number;
    timeRangeLabel?: string;
    taskTitle?: string;
    taskId?: string;
    activityReason?: string;
  };
};

export type WorkspaceAiAnswer = {
  content: string;
  provider?: "openai" | "groq" | "puter";
  providerLabel?: string;
  model?: string;
  sufficientContext: boolean;
  sources: WorkspaceAiSource[];
};

export async function requestAiSuggestion(token: string | null | undefined, prompt: string) {
  const response = await fetch(`${API_URL}/ai/suggest`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ prompt })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message ?? "AI request failed";
    throw new Error(message);
  }

  return payload as { content: string; provider?: "openai" | "groq" | "puter"; providerLabel?: string; model?: string };
}

export async function requestWorkspaceAiAnswer(token: string | null | undefined, workspaceId: string, question: string) {
  const response = await fetch(`${API_URL}/ai/ask`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ workspaceId, question })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message ?? "AI knowledge search failed";
    throw new Error(message);
  }

  return payload as WorkspaceAiAnswer;
}

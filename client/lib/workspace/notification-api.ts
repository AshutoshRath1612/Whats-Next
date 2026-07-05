const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type WorkspaceNotification = {
  id: string;
  title: string;
  body: string;
  tone?: "default" | "warning" | "success";
  createdAt?: string;
  source?: "system" | "workspace";
};

export type DailySummaryResult = {
  delivered: boolean;
  subject: string;
  body: string;
  ai?: {
    content: string;
    providerLabel?: string;
    model?: string;
  };
};

async function notificationRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function listNotificationsRequest(token: string | null | undefined, workspaceId: string) {
  const params = new URLSearchParams({ workspaceId });
  return notificationRequest<WorkspaceNotification[]>(`/notifications?${params.toString()}`, token);
}

export function sendDailySummaryRequest(token: string | null | undefined, workspaceId: string) {
  return notificationRequest<DailySummaryResult>("/notifications/daily-summary", token, {
    method: "POST",
    body: JSON.stringify({ workspaceId })
  });
}

export function sendDeadlineRemindersRequest(token: string | null | undefined, workspaceId: string) {
  return notificationRequest<DailySummaryResult>("/notifications/deadline-reminders", token, {
    method: "POST",
    body: JSON.stringify({ workspaceId })
  });
}

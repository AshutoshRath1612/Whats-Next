const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type DashboardAnalytics = {
  counts: {
    openTasks: number;
    completedTasks: number;
    projects: number;
    tickets: number;
    overdueTasks?: number;
    dueThisWeek?: number;
    pendingTasks?: number;
    inProgressTasks?: number;
  };
  weeklyProgress: Array<{
    day: string;
    completed: number;
    created?: number;
    due?: number;
    overdue?: number;
    open?: number;
    focusedMinutes: number;
    focusedSeconds?: number;
  }>;
};

async function analyticsRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function getDashboardAnalyticsRequest(token: string | null | undefined, workspaceId: string) {
  const params = new URLSearchParams({ workspaceId });
  return analyticsRequest<DashboardAnalytics>(`/analytics/dashboard?${params.toString()}`, token);
}

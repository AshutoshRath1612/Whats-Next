import { CalendarEvent } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiCalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  reminders?: unknown;
};

export type CreateCalendarEventInput = Pick<CalendarEvent, "title" | "date" | "start" | "end" | "type"> & Partial<Pick<CalendarEvent, "taskId" | "projectId">>;
export type UpdateCalendarEventInput = Pick<CalendarEvent, "id" | "title" | "date" | "start" | "end" | "type" | "reminderEnabled" | "reminderMinutes"> &
  Partial<Pick<CalendarEvent, "taskId" | "projectId">>;

async function calendarRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function mapApiCalendarEvent(event: ApiCalendarEvent): CalendarEvent {
  const reminders = parseReminder(event.reminders);
  const metadata = parseEventMetadata(event.description);
  return {
    id: event.id,
    title: event.title,
    date: event.startsAt.slice(0, 10),
    start: formatEventTime(event.startsAt),
    end: formatEventTime(event.endsAt),
    type: metadata.type,
    taskId: metadata.taskId,
    projectId: metadata.projectId,
    reminderEnabled: reminders.enabled,
    reminderMinutes: reminders.minutes
  };
}

export function listCalendarEventsRequest(token: string | null | undefined, workspaceId: string) {
  return calendarRequest<ApiCalendarEvent[]>(`/calendar?workspaceId=${encodeURIComponent(workspaceId)}`, token);
}

export function createCalendarEventRequest(token: string | null | undefined, workspaceId: string, input: CreateCalendarEventInput) {
  return calendarRequest<ApiCalendarEvent>("/calendar", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      title: input.title,
      description: stringifyEventMetadata(input),
      startsAt: toEventIso(input.date, input.start),
      endsAt: toEventIso(input.date, input.end),
      type: input.type
    })
  });
}

export function updateCalendarReminderRequest(token: string | null | undefined, event: CalendarEvent) {
  return calendarRequest<ApiCalendarEvent>(`/calendar/${event.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      description: stringifyEventMetadata(event),
      reminders: [{ enabled: event.reminderEnabled, minutes: event.reminderMinutes }]
    })
  });
}

export function updateCalendarEventRequest(token: string | null | undefined, event: UpdateCalendarEventInput) {
  return calendarRequest<ApiCalendarEvent>(`/calendar/${event.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      title: event.title,
      description: stringifyEventMetadata(event),
      startsAt: toEventIso(event.date, event.start),
      endsAt: toEventIso(event.date, event.end),
      type: event.type,
      reminders: [{ enabled: event.reminderEnabled, minutes: event.reminderMinutes }]
    })
  });
}

export function deleteCalendarEventRequest(token: string | null | undefined, eventId: string) {
  return calendarRequest<ApiCalendarEvent>(`/calendar/${eventId}`, token, { method: "DELETE" });
}

function toEventIso(dateValue: string | undefined, value: string) {
  const [hours, minutes] = value.includes(":") ? value.split(":").map((part) => Number.parseInt(part, 10)) : [9, 0];
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  date.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date.toISOString();
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "09:00";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function parseEventType(value?: string | null): CalendarEvent["type"] {
  return value === "Meeting" || value === "Reminder" ? value : "Focus";
}

function parseEventMetadata(value?: string | null): Pick<CalendarEvent, "type" | "taskId" | "projectId"> {
  if (!value) return { type: "Focus" };
  try {
    const parsed = JSON.parse(value) as Partial<Pick<CalendarEvent, "type" | "taskId" | "projectId">>;
    return {
      type: parseEventType(parsed.type),
      taskId: parsed.taskId,
      projectId: parsed.projectId
    };
  } catch {
    return { type: parseEventType(value) };
  }
}

function stringifyEventMetadata(event: Pick<CalendarEvent, "type"> & Partial<Pick<CalendarEvent, "taskId" | "projectId">>) {
  return JSON.stringify({
    type: event.type,
    taskId: event.taskId || undefined,
    projectId: event.projectId || undefined
  });
}

function parseReminder(value: unknown) {
  if (!Array.isArray(value)) return { enabled: false, minutes: 10 };
  const reminder = value.find((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  return {
    enabled: typeof reminder?.enabled === "boolean" ? reminder.enabled : false,
    minutes: typeof reminder?.minutes === "number" ? reminder.minutes : 10
  };
}

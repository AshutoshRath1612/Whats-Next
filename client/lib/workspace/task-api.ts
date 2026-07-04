import { ChecklistItem, Priority, RecurrenceRule, Task, TaskNote, TaskStatus, TaskSubtask, TaskWorkType, TicketSeverity } from "./types";

export type ApiTaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "PENDING" | "REVIEW" | "DONE" | "CANCELED";
export type ApiPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ApiTask = {
  id: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  status: ApiTaskStatus;
  priority: ApiPriority;
  recurringRule?: string | null;
  labels?: string[];
  tags?: string[];
  checklist?: unknown;
  dueDate?: string | null;
  updatedAt?: string | null;
  timeEstimate?: number | null;
  actualTime?: number | null;
  customFields?: unknown;
};

export type CreateTaskInput = Pick<Task, "title" | "description" | "projectId" | "priority" | "startDate" | "due" | "estimateMinutes" | "acceptanceCriteria"> & {
  tags?: string[];
  checklist?: ChecklistItem[];
  subtasks?: TaskSubtask[];
  dependencies?: string[];
  recurringRule?: RecurrenceRule;
  workType?: TaskWorkType;
  ticketNumber?: string;
  customer?: string;
  severity?: TicketSeverity;
  investigation?: string;
  resolution?: string;
  closureNotes?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

const statusToApi: Record<TaskStatus, ApiTaskStatus> = {
  Backlog: "BACKLOG",
  Todo: "TODO",
  "In Progress": "IN_PROGRESS",
  Pending: "PENDING",
  Review: "REVIEW",
  Done: "DONE"
};

const statusFromApi: Record<ApiTaskStatus, TaskStatus> = {
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending",
  REVIEW: "Review",
  DONE: "Done",
  CANCELED: "Backlog"
};

const priorityToApi: Record<Priority, ApiPriority> = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Urgent: "URGENT"
};

const priorityFromApi: Record<ApiPriority, Priority> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent"
};

async function taskRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : `check-${index}`,
      label: typeof item.label === "string" ? item.label : "Checklist item",
      done: typeof item.done === "boolean" ? item.done : false
    }));
}

function asTaskNotes(value: unknown): TaskNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : `task-note-${index}`,
      body: typeof item.body === "string" ? item.body : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "Recently"
    }))
    .filter((item) => item.body);
}

function asTaskSubtasks(value: unknown): TaskSubtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): TaskSubtask | null => {
      if (typeof item === "string") {
        return { id: `subtask-${index}`, title: item, status: "Todo", priority: "Medium" };
      }
      if (!isRecord(item)) return null;
      return {
        id: typeof item.id === "string" ? item.id : `subtask-${index}`,
        title: typeof item.title === "string" ? item.title : "Untitled subtask",
        status: asTaskStatus(item.status),
        priority: asPriority(item.priority),
        due: typeof item.due === "string" ? item.due : undefined
      };
    })
    .filter((item): item is TaskSubtask => Boolean(item));
}

function asRecurrenceRule(value: unknown): RecurrenceRule {
  return value === "Daily" || value === "Weekly" || value === "Monthly" ? value : "None";
}

function asWorkType(value: unknown): TaskWorkType {
  return value === "Ticket" ? "Ticket" : "Task";
}

function asSeverity(value: unknown): TicketSeverity {
  return value === "Low" || value === "High" || value === "Critical" ? value : "Medium";
}

function asTaskStatus(value: unknown): TaskStatus {
  return value === "Backlog" || value === "In Progress" || value === "Pending" || value === "Review" || value === "Done" ? value : "Todo";
}

function asPriority(value: unknown): Priority {
  return value === "Low" || value === "High" || value === "Urgent" ? value : "Medium";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function computeTaskProgress(status: ApiTaskStatus, customFields: Record<string, unknown>) {
  const subtasks = asTaskSubtasks(customFields.subtasks);
  if (subtasks.length > 0) {
    return Math.round((subtasks.filter((subtask) => subtask.status === "Done").length / subtasks.length) * 100);
  }
  if (status === "DONE") return 100;
  return typeof customFields.progress === "number" && customFields.progress < 100 ? customFields.progress : 0;
}

export function mapApiTask(task: ApiTask): Task {
  const customFields = isRecord(task.customFields) ? task.customFields : {};
  const progress = computeTaskProgress(task.status, customFields);

  return {
    id: task.id,
    title: task.title,
    description: task.description ?? "",
    projectId: task.projectId ?? undefined,
    owner: "Current user",
    workType: asWorkType(customFields.workType),
    status: statusFromApi[task.status] ?? "Todo",
    priority: priorityFromApi[task.priority] ?? "Medium",
    ticketNumber: asString(customFields.ticketNumber),
    customer: asString(customFields.customer),
    severity: asSeverity(customFields.severity),
    investigation: asString(customFields.investigation),
    resolution: asString(customFields.resolution),
    closureNotes: asString(customFields.closureNotes),
    overdueReason: asString(customFields.overdueReason),
    recurringRule: asRecurrenceRule(task.recurringRule),
    startDate: typeof customFields.startDate === "string" ? customFields.startDate : "",
    due: task.dueDate ? task.dueDate.slice(0, 10) : "TBD",
    updatedAt: task.updatedAt ?? undefined,
    tags: task.tags ?? task.labels ?? [],
    checklist: asChecklist(task.checklist),
    subtasks: asTaskSubtasks(customFields.subtasks),
    dependencies: asStringArray(customFields.dependencies),
    attachments: asStringArray(customFields.attachments),
    acceptanceCriteria: typeof customFields.acceptanceCriteria === "string" ? customFields.acceptanceCriteria : "",
    notes: asTaskNotes(customFields.notes),
    progress,
    estimateMinutes: task.timeEstimate ?? 60,
    actualMinutes: task.actualTime ?? 0
  };
}

export function listTasksRequest(token: string | null | undefined, workspaceId: string) {
  const params = new URLSearchParams({ workspaceId });
  return taskRequest<ApiTask[]>(`/tasks?${params.toString()}`, token);
}

export function createTaskRequest(token: string | null | undefined, workspaceId: string, input: CreateTaskInput) {
  return taskRequest<ApiTask>("/tasks", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      priority: priorityToApi[input.priority],
      status: "TODO",
      recurringRule: input.recurringRule && input.recurringRule !== "None" ? input.recurringRule : undefined,
      labels: input.tags ?? [],
      tags: input.tags ?? [],
      checklist: input.checklist ?? [],
      dueDate: input.due && input.due !== "TBD" ? input.due : undefined,
      timeEstimate: input.estimateMinutes,
      actualTime: 0,
      customFields: {
        workType: input.workType ?? "Task",
        ticketNumber: input.ticketNumber ?? "",
        customer: input.customer ?? "",
        severity: input.severity ?? "Medium",
        investigation: input.investigation ?? "",
        resolution: input.resolution ?? "",
        closureNotes: input.closureNotes ?? "",
        overdueReason: "",
        startDate: input.startDate,
        progress: 0,
        acceptanceCriteria: input.acceptanceCriteria,
        subtasks: input.subtasks ?? [],
        dependencies: input.dependencies ?? [],
        attachments: [],
        notes: []
      }
    })
  });
}

export function updateTaskRequest(token: string | null | undefined, task: Task) {
  return taskRequest<ApiTask>(`/tasks/${task.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      title: task.title,
      description: task.description,
      priority: priorityToApi[task.priority],
      status: statusToApi[task.status],
      recurringRule: task.recurringRule !== "None" ? task.recurringRule : null,
      labels: task.tags,
      tags: task.tags,
      checklist: task.checklist,
      dueDate: task.due && task.due !== "TBD" ? task.due : null,
      timeEstimate: task.estimateMinutes,
      actualTime: task.actualMinutes,
      customFields: {
        workType: task.workType,
        ticketNumber: task.ticketNumber ?? "",
        customer: task.customer ?? "",
        severity: task.severity ?? "Medium",
        investigation: task.investigation ?? "",
        resolution: task.resolution ?? "",
        closureNotes: task.closureNotes ?? "",
        overdueReason: task.overdueReason ?? "",
        startDate: task.startDate,
        progress: task.progress,
        acceptanceCriteria: task.acceptanceCriteria,
        subtasks: task.subtasks,
        dependencies: task.dependencies,
        attachments: task.attachments,
        notes: task.notes
      }
    })
  });
}

export function updateTaskStatusRequest(token: string | null | undefined, taskId: string, status: TaskStatus) {
  return taskRequest<ApiTask>(`/tasks/${taskId}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ status: statusToApi[status] })
  });
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarEvent,
  FileAsset,
  KnowledgeArticle,
  Note,
  Priority,
  RecurrenceRule,
  Project,
  SqlSnippet,
  Task,
  TaskStatus,
  TaskSubtask,
  Template,
  Ticket,
  TimeEntry,
  WorkspaceState
} from "./types";
import type { CreateTaskInput } from "./task-api";

export const emptyWorkspaceState: WorkspaceState = {
  tasks: [],
  projects: [],
  notes: [],
  tickets: [],
  articles: [],
  sqlSnippets: [],
  events: [],
  templates: [],
  files: [],
  timeEntries: [],
  aiDraft: ""
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createNoteVersion(note: Note, savedAt: string) {
  return {
    id: createId("note-version"),
    title: note.title,
    content: note.content,
    tags: note.tags,
    projectId: note.projectId,
    pinned: note.pinned,
    savedAt
  };
}

function createSqlVersion(snippet: SqlSnippet, savedAt: string) {
  return {
    id: createId("sql-version"),
    title: snippet.title,
    description: snippet.description,
    query: snippet.query,
    folder: snippet.folder,
    executionNotes: snippet.executionNotes,
    tags: snippet.tags,
    favorite: snippet.favorite,
    savedAt
  };
}

function extractTemplateVariables(body: string) {
  return Array.from(new Set(Array.from(body.matchAll(/{{\s*([^}]+)\s*}}/g)).map((match) => match[1].trim()).filter(Boolean)));
}

function normalizeTask(task: Partial<Task>, index: number): Task {
  const subtasks = normalizeSubtasks(task.subtasks);
  const status = task.status ?? "Todo";
  return {
    id: task.id ?? createId("task"),
    title: task.title ?? `Untitled task ${index + 1}`,
    description: task.description ?? "",
    projectId: task.projectId,
    owner: task.owner ?? "Current user",
    workType: task.workType ?? "Task",
    status,
    priority: task.priority ?? "Medium",
    ticketNumber: task.ticketNumber,
    customer: task.customer,
    severity: task.severity ?? "Medium",
    investigation: task.investigation ?? "",
    resolution: task.resolution ?? "",
    closureNotes: task.closureNotes ?? "",
    overdueReason: task.overdueReason ?? "",
    recurringRule: task.recurringRule ?? "None",
    startDate: task.startDate ?? "Today",
    due: task.due ?? "TBD",
    updatedAt: task.updatedAt,
    tags: Array.isArray(task.tags) ? task.tags : [],
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
    subtasks,
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    acceptanceCriteria: task.acceptanceCriteria ?? "",
    notes: Array.isArray(task.notes) ? task.notes : [],
    progress: subtasks.length > 0 ? calculateSubtaskProgress(subtasks) : calculateStandaloneProgress(status, task.progress),
    estimateMinutes: typeof task.estimateMinutes === "number" ? task.estimateMinutes : 60,
    actualMinutes: typeof task.actualMinutes === "number" ? task.actualMinutes : 0
  };
}

function normalizeSubtasks(value: unknown): TaskSubtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): TaskSubtask | null => {
      if (typeof item === "string") {
        return { id: createId("subtask"), title: item, status: "Todo", priority: "Medium" };
      }
      if (!item || typeof item !== "object") return null;
      const subtask = item as Partial<TaskSubtask>;
      return {
        id: subtask.id ?? createId("subtask"),
        title: subtask.title ?? `Subtask ${index + 1}`,
        status: subtask.status ?? "Todo",
        priority: subtask.priority ?? "Medium",
        due: subtask.due
      };
    })
    .filter((item): item is TaskSubtask => Boolean(item));
}

function calculateSubtaskProgress(subtasks: TaskSubtask[]) {
  if (subtasks.length === 0) return 0;
  return Math.round((subtasks.filter((subtask) => subtask.status === "Done").length / subtasks.length) * 100);
}

function calculateStandaloneProgress(status: TaskStatus, progress: unknown) {
  if (status === "Done") return 100;
  return typeof progress === "number" && progress < 100 ? progress : 0;
}

function normalizeProject(project: Partial<Project>, index: number): Project {
  return {
    id: project.id ?? createId("project"),
    name: project.name ?? `Untitled project ${index + 1}`,
    description: project.description ?? "",
    icon: project.icon ?? "folder-kanban",
    coverUrl: project.coverUrl ?? "",
    color: project.color ?? "bg-indigo-500",
    progress: typeof project.progress === "number" ? project.progress : 0,
    due: project.due ?? "TBD",
    pinned: Boolean(project.pinned),
    archived: Boolean(project.archived),
    milestones: Array.isArray(project.milestones) ? project.milestones : []
  };
}

function normalizeArticle(article: Partial<KnowledgeArticle>, index: number): KnowledgeArticle {
  return {
    id: article.id ?? createId("article"),
    title: article.title ?? `Untitled article ${index + 1}`,
    problem: article.problem ?? "",
    rootCause: article.rootCause ?? "",
    resolution: article.resolution ?? "",
    tags: Array.isArray(article.tags) ? article.tags : [],
    references: Array.isArray(article.references) ? article.references : []
  };
}

function normalizeNote(note: Partial<Note>, index: number): Note {
  const versions = Array.isArray(note.versions) ? note.versions : [];
  return {
    id: note.id ?? createId("note"),
    projectId: note.projectId,
    title: note.title ?? `Untitled note ${index + 1}`,
    content: note.content ?? "",
    tags: Array.isArray(note.tags) ? note.tags : [],
    pinned: Boolean(note.pinned),
    updatedAt: note.updatedAt ?? "Recently",
    versions
  };
}

function normalizeSqlSnippet(snippet: Partial<SqlSnippet>, index: number): SqlSnippet {
  return {
    id: snippet.id ?? createId("sql"),
    title: snippet.title ?? `Untitled SQL ${index + 1}`,
    description: snippet.description ?? "",
    query: snippet.query ?? "",
    folder: snippet.folder ?? "General",
    executionNotes: snippet.executionNotes ?? "",
    favorite: Boolean(snippet.favorite),
    tags: Array.isArray(snippet.tags) ? snippet.tags : [],
    history: Array.isArray(snippet.history) ? snippet.history : []
  };
}

function normalizeEvent(event: Partial<CalendarEvent>, index: number): CalendarEvent {
  return {
    id: event.id ?? createId("event"),
    title: event.title ?? `Untitled event ${index + 1}`,
    date: event.date ?? new Date().toISOString().slice(0, 10),
    start: event.start ?? "09:00",
    end: event.end ?? "09:30",
    type: event.type ?? "Focus",
    taskId: event.taskId,
    projectId: event.projectId,
    reminderEnabled: Boolean(event.reminderEnabled),
    reminderMinutes: typeof event.reminderMinutes === "number" ? event.reminderMinutes : 10
  };
}

function normalizeTemplate(template: Partial<Template>, index: number): Template {
  return {
    id: template.id ?? createId("template"),
    name: template.name ?? `Untitled template ${index + 1}`,
    category: template.category ?? "General",
    body: template.body ?? "",
    variables: Array.isArray(template.variables) ? template.variables : extractTemplateVariables(template.body ?? ""),
    favorite: Boolean(template.favorite)
  };
}

function normalizeFileAsset(file: Partial<FileAsset>, index: number): FileAsset {
  return {
    id: file.id ?? createId("file"),
    name: file.name ?? `Untitled file ${index + 1}`,
    type: file.type ?? "application/octet-stream",
    size: typeof file.size === "number" ? file.size : 0,
    url: file.url,
    linkedType: file.linkedType ?? "None",
    linkedId: file.linkedId,
    uploadedAt: file.uploadedAt ?? "Just now"
  };
}

function normalizeState(value: unknown): WorkspaceState {
  if (!value || typeof value !== "object") return emptyWorkspaceState;
  const partial = value as Partial<WorkspaceState>;
  return {
    tasks: Array.isArray(partial.tasks) ? partial.tasks.map((task, index) => normalizeTask(task, index)) : emptyWorkspaceState.tasks,
    projects: Array.isArray(partial.projects) ? partial.projects.map((project, index) => normalizeProject(project, index)) : emptyWorkspaceState.projects,
    notes: Array.isArray(partial.notes) ? partial.notes.map((note, index) => normalizeNote(note, index)) : emptyWorkspaceState.notes,
    tickets: Array.isArray(partial.tickets) ? partial.tickets : emptyWorkspaceState.tickets,
    articles: Array.isArray(partial.articles) ? partial.articles.map((article, index) => normalizeArticle(article, index)) : emptyWorkspaceState.articles,
    sqlSnippets: Array.isArray(partial.sqlSnippets) ? partial.sqlSnippets.map((snippet, index) => normalizeSqlSnippet(snippet, index)) : emptyWorkspaceState.sqlSnippets,
    events: Array.isArray(partial.events) ? partial.events.map((event, index) => normalizeEvent(event, index)) : emptyWorkspaceState.events,
    templates: Array.isArray(partial.templates) ? partial.templates.map((template, index) => normalizeTemplate(template, index)) : emptyWorkspaceState.templates,
    files: Array.isArray(partial.files) ? partial.files.map((file, index) => normalizeFileAsset(file, index)) : emptyWorkspaceState.files,
    timeEntries: Array.isArray(partial.timeEntries) ? partial.timeEntries : emptyWorkspaceState.timeEntries,
    aiDraft: typeof partial.aiDraft === "string" ? partial.aiDraft : ""
  };
}

function elapsedFor(entry: TimeEntry, now: number) {
  if (entry.status !== "Running") return entry.elapsedSeconds;
  return entry.elapsedSeconds + Math.max(0, Math.floor((now - entry.startedAt) / 1000));
}

export function useWorkspaceStore() {
  const [state, setState] = useState<WorkspaceState>(emptyWorkspaceState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const hasRunningTimer = state.timeEntries.some((entry) => entry.status === "Running");
    if (!hasRunningTimer) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [state.timeEntries]);

  const runningTimer = useMemo(() => state.timeEntries.find((entry) => entry.status !== "Stopped"), [state.timeEntries]);
  const completedTasks = useMemo(() => state.tasks.filter((task) => task.status === "Done").length, [state.tasks]);
  const openTasks = useMemo(() => state.tasks.length - completedTasks, [completedTasks, state.tasks.length]);
  const activeTicketTasks = useMemo(() => state.tasks.filter((task) => task.workType === "Ticket" && task.status !== "Done").length, [state.tasks]);
  const focusSeconds = useMemo(() => state.timeEntries.reduce((total, entry) => total + elapsedFor(entry, now), 0), [now, state.timeEntries]);
  const focusMinutes = useMemo(() => Math.floor(focusSeconds / 60), [focusSeconds]);

  return {
    state,
    metrics: {
      openTasks,
      completedTasks,
      focusSeconds,
      focusMinutes,
      activeTickets: activeTicketTasks + state.tickets.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status)).length,
      pinnedProjects: state.projects.filter((project) => project.pinned),
      pinnedNotes: state.notes.filter((note) => note.pinned),
      runningTimer
    },
    getTimerElapsed(entry: TimeEntry) {
      return elapsedFor(entry, now);
    },
    setTasks(tasks: Task[]) {
      setState((current) => ({ ...current, tasks }));
    },
    setArticles(articles: KnowledgeArticle[]) {
      setState((current) => ({ ...current, articles }));
    },
    setNotes(notes: Note[]) {
      setState((current) => ({ ...current, notes }));
    },
    setProjects(projects: Project[]) {
      setState((current) => ({ ...current, projects }));
    },
    setSqlSnippets(sqlSnippets: SqlSnippet[]) {
      setState((current) => ({ ...current, sqlSnippets }));
    },
    setEvents(events: CalendarEvent[]) {
      setState((current) => ({ ...current, events }));
    },
    setTimeEntries(timeEntries: TimeEntry[]) {
      setState((current) => ({ ...current, timeEntries }));
    },
    setFiles(files: FileAsset[]) {
      setState((current) => ({ ...current, files }));
    },
    setTemplates(templates: Template[]) {
      setState((current) => ({ ...current, templates }));
    },
    upsertProject(project: Project) {
      setState((current) => {
        const exists = current.projects.some((item) => item.id === project.id);
        return {
          ...current,
          projects: exists ? current.projects.map((item) => (item.id === project.id ? project : item)) : [project, ...current.projects]
        };
      });
    },
    upsertSqlSnippet(snippet: SqlSnippet) {
      setState((current) => {
        const exists = current.sqlSnippets.some((item) => item.id === snippet.id);
        return {
          ...current,
          sqlSnippets: exists ? current.sqlSnippets.map((item) => (item.id === snippet.id ? snippet : item)) : [snippet, ...current.sqlSnippets]
        };
      });
    },
    upsertEvent(event: CalendarEvent) {
      setState((current) => {
        const exists = current.events.some((item) => item.id === event.id);
        return {
          ...current,
          events: exists ? current.events.map((item) => (item.id === event.id ? event : item)) : [event, ...current.events]
        };
      });
    },
    upsertTimeEntry(timeEntry: TimeEntry) {
      setState((current) => {
        const exists = current.timeEntries.some((item) => item.id === timeEntry.id);
        return {
          ...current,
          timeEntries: exists ? current.timeEntries.map((item) => (item.id === timeEntry.id ? timeEntry : item)) : [timeEntry, ...current.timeEntries]
        };
      });
    },
    upsertNote(note: Note) {
      setState((current) => {
        const exists = current.notes.some((item) => item.id === note.id);
        return {
          ...current,
          notes: exists ? current.notes.map((item) => (item.id === note.id ? note : item)) : [note, ...current.notes]
        };
      });
    },
    upsertTask(task: Task) {
      setState((current) => {
        const exists = current.tasks.some((item) => item.id === task.id);
        return {
          ...current,
          tasks: exists ? current.tasks.map((item) => (item.id === task.id ? task : item)) : [task, ...current.tasks]
        };
      });
    },
    addTask(input: CreateTaskInput) {
      const task: Task = {
        id: createId("task"),
        title: input.title,
        description: input.description,
        projectId: input.projectId,
        owner: "Current user",
        workType: input.workType ?? "Task",
        status: "Todo",
        priority: input.priority,
        ticketNumber: input.ticketNumber,
        customer: input.customer,
        severity: input.severity ?? "Medium",
        investigation: input.investigation ?? "",
        resolution: input.resolution ?? "",
        closureNotes: input.closureNotes ?? "",
        overdueReason: "",
        recurringRule: input.recurringRule ?? "None",
        startDate: input.startDate,
        due: input.due,
        tags: input.tags ?? [],
        checklist: input.checklist ?? [],
        subtasks: input.subtasks ?? [],
        dependencies: input.dependencies ?? [],
        attachments: [],
        notes: [],
        progress: 0,
        estimateMinutes: input.estimateMinutes,
        actualMinutes: 0,
        acceptanceCriteria: input.acceptanceCriteria
      };
      setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
      return task;
    },
    updateTask(taskId: string, patch: Partial<Task>) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? normalizeTask({ ...task, ...patch }, 0) : task))
      }));
    },
    setTaskStatus(taskId: string, status: TaskStatus) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId
            ? normalizeTask({
                ...task,
                status,
                subtasks: status === "Done" ? task.subtasks.map((subtask) => ({ ...subtask, status: "Done" as const })) : task.subtasks,
                progress: status === "Done" ? 100 : task.status === "Done" ? 0 : task.progress
              }, 0)
            : task
        )
      }));
    },
    toggleTaskChecklistItem(taskId: string, itemId: string) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                checklist: task.checklist.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
              }
            : task
        )
      }));
    },
    addTaskNote(taskId: string, body: string) {
      const trimmed = body.trim();
      if (!trimmed) return;
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                notes: [
                  { id: createId("task-note"), body: trimmed, createdAt: new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) },
                  ...task.notes
                ]
              }
            : task
        )
      }));
    },
    addProject(input: Pick<Project, "name" | "description" | "due"> & Partial<Pick<Project, "icon" | "coverUrl" | "color">>) {
      const project: Project = {
        id: createId("project"),
        icon: "folder-kanban",
        coverUrl: "",
        color: "bg-indigo-500",
        progress: 0,
        pinned: true,
        milestones: [
          { id: createId("milestone"), title: "Scope confirmed", due: "This week", completed: false },
          { id: createId("milestone"), title: "Implementation ready", due: input.due || "TBD", completed: false }
        ],
        ...input
      };
      setState((current) => ({ ...current, projects: [project, ...current.projects] }));
    },
    deleteProject(projectId: string) {
      setState((current) => ({
        ...current,
        projects: current.projects.map((project) => (project.id === projectId ? { ...project, archived: true, pinned: false } : project))
      }));
    },
    addNote(input: Pick<Note, "title" | "content" | "tags"> & Partial<Pick<Note, "projectId" | "pinned">>) {
      const savedAt = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const note: Note = {
        id: createId("note"),
        pinned: false,
        updatedAt: "Just now",
        versions: [],
        ...input
      };
      note.versions = [createNoteVersion(note, savedAt)];
      setState((current) => ({ ...current, notes: [note, ...current.notes] }));
      return note;
    },
    updateNote(note: Note) {
      setState((current) => ({
        ...current,
        notes: current.notes.map((item) => {
          if (item.id !== note.id) return item;
          const savedAt = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          return {
            ...note,
            updatedAt: "Just now",
            versions: [createNoteVersion(item, savedAt), ...(note.versions ?? [])].slice(0, 20)
          };
        })
      }));
    },
    restoreNoteVersion(noteId: string, versionId: string) {
      setState((current) => ({
        ...current,
        notes: current.notes.map((note) => {
          if (note.id !== noteId) return note;
          const version = note.versions.find((item) => item.id === versionId);
          if (!version) return note;
          const savedAt = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          const currentVersion = createNoteVersion(note, savedAt);
          return {
            ...note,
            title: version.title,
            content: version.content,
            tags: version.tags,
            projectId: version.projectId,
            pinned: version.pinned,
            updatedAt: "Just now",
            versions: [currentVersion, ...note.versions].slice(0, 20)
          };
        })
      }));
    },
    toggleNotePinned(noteId: string) {
      setState((current) => ({
        ...current,
        notes: current.notes.map((note) => (note.id === noteId ? { ...note, pinned: !note.pinned } : note))
      }));
    },
    addTicket(input: Pick<Ticket, "number" | "title" | "customer" | "priority" | "severity">) {
      const ticket: Ticket = {
        id: createId("ticket"),
        status: "Open",
        ...input
      };
      setState((current) => ({ ...current, tickets: [ticket, ...current.tickets] }));
    },
    setTicketStatus(ticketId: string, status: Ticket["status"]) {
      setState((current) => ({
        ...current,
        tickets: current.tickets.map((ticket) => (ticket.id === ticketId ? { ...ticket, status } : ticket))
      }));
    },
    addSqlSnippet(input: Pick<SqlSnippet, "title" | "description" | "query" | "folder">) {
      const savedAt = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const snippet: SqlSnippet = {
        id: createId("sql"),
        favorite: false,
        tags: ["postgres"],
        history: [],
        executionNotes: "",
        ...input
      };
      snippet.history = [createSqlVersion(snippet, savedAt)];
      setState((current) => ({ ...current, sqlSnippets: [snippet, ...current.sqlSnippets] }));
    },
    updateSqlSnippet(snippet: SqlSnippet) {
      setState((current) => ({
        ...current,
        sqlSnippets: current.sqlSnippets.map((item) => {
          if (item.id !== snippet.id) return item;
          const savedAt = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          return {
            ...snippet,
            history: [createSqlVersion(item, savedAt), ...(snippet.history ?? [])].slice(0, 20)
          };
        })
      }));
    },
    restoreSqlSnippetVersion(snippetId: string, versionId: string) {
      setState((current) => ({
        ...current,
        sqlSnippets: current.sqlSnippets.map((snippet) => {
          if (snippet.id !== snippetId) return snippet;
          const version = snippet.history.find((item) => item.id === versionId);
          if (!version) return snippet;
          const savedAt = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          const currentVersion = createSqlVersion(snippet, savedAt);
          return {
            ...snippet,
            title: version.title,
            description: version.description,
            query: version.query,
            folder: version.folder,
            executionNotes: version.executionNotes,
            tags: version.tags,
            favorite: version.favorite,
            history: [currentVersion, ...snippet.history].slice(0, 20)
          };
        })
      }));
    },
    addArticle(input: Pick<KnowledgeArticle, "title" | "problem" | "rootCause" | "resolution"> & Partial<Pick<KnowledgeArticle, "tags" | "references">>) {
      const article: KnowledgeArticle = {
        id: createId("article"),
        tags: ["documentation"],
        references: [],
        ...input
      };
      setState((current) => ({ ...current, articles: [article, ...current.articles] }));
      return article;
    },
    upsertArticle(article: KnowledgeArticle) {
      setState((current) => {
        const exists = current.articles.some((item) => item.id === article.id);
        return {
          ...current,
          articles: exists ? current.articles.map((item) => (item.id === article.id ? article : item)) : [article, ...current.articles]
        };
      });
    },
    addEvent(input: Pick<CalendarEvent, "title" | "start" | "end" | "type"> & Partial<Pick<CalendarEvent, "taskId" | "projectId">>) {
      const event: CalendarEvent = { id: createId("event"), date: new Date().toISOString().slice(0, 10), reminderEnabled: false, reminderMinutes: 10, ...input };
      setState((current) => ({ ...current, events: [...current.events, event] }));
    },
    updateEvent(event: CalendarEvent) {
      setState((current) => ({
        ...current,
        events: current.events.map((item) => (item.id === event.id ? event : item))
      }));
    },
    deleteEvent(eventId: string) {
      setState((current) => ({
        ...current,
        events: current.events.filter((event) => event.id !== eventId)
      }));
    },
    setEventReminder(eventId: string, reminderEnabled: boolean, reminderMinutes: number) {
      setState((current) => ({
        ...current,
        events: current.events.map((event) => (event.id === eventId ? { ...event, reminderEnabled, reminderMinutes } : event))
      }));
    },
    addTemplate(input: Pick<Template, "name" | "category" | "body">) {
      const template: Template = { id: createId("template"), variables: extractTemplateVariables(input.body), favorite: false, ...input };
      setState((current) => ({ ...current, templates: [template, ...current.templates] }));
    },
    upsertTemplate(template: Template) {
      setState((current) => {
        const exists = current.templates.some((item) => item.id === template.id);
        return {
          ...current,
          templates: exists ? current.templates.map((item) => (item.id === template.id ? template : item)) : [template, ...current.templates]
        };
      });
    },
    toggleTemplateFavorite(templateId: string) {
      setState((current) => ({
        ...current,
        templates: current.templates.map((template) => (template.id === templateId ? { ...template, favorite: !template.favorite } : template))
      }));
    },
    addFileAsset(input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>) {
      const file: FileAsset = {
        id: createId("file"),
        uploadedAt: new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        ...input
      };
      setState((current) => ({ ...current, files: [file, ...current.files] }));
    },
    upsertFileAsset(file: FileAsset) {
      setState((current) => {
        const exists = current.files.some((item) => item.id === file.id);
        return {
          ...current,
          files: exists ? current.files.map((item) => (item.id === file.id ? file : item)) : [file, ...current.files]
        };
      });
    },
    deleteFileAsset(fileId: string) {
      setState((current) => ({ ...current, files: current.files.filter((file) => file.id !== fileId) }));
    },
    startTimer(title: string, taskId?: string) {
      const entry: TimeEntry = {
        id: createId("timer"),
        title,
        taskId,
        status: "Running",
        startedAt: Date.now(),
        elapsedSeconds: 0
      };
      setState((current) => ({
        ...current,
        timeEntries: [entry, ...current.timeEntries.map((item) => (item.status === "Running" ? { ...item, status: "Paused" as const } : item))]
      }));
    },
    addManualTimeEntry(title: string, minutes: number, taskId?: string) {
      const entry: TimeEntry = {
        id: createId("timer"),
        title,
        taskId,
        status: "Stopped",
        startedAt: Date.now(),
        elapsedSeconds: Math.max(0, minutes * 60)
      };
      setState((current) => ({ ...current, timeEntries: [entry, ...current.timeEntries] }));
    },
    toggleTimer(timerId: string) {
      const timestamp = Date.now();
      setState((current) => ({
        ...current,
        timeEntries: current.timeEntries.map((entry) => {
          if (entry.id !== timerId) return entry;
          if (entry.status === "Running") {
            return { ...entry, status: "Paused" as const, elapsedSeconds: elapsedFor(entry, timestamp), startedAt: timestamp };
          }
          if (entry.status === "Paused") {
            return { ...entry, status: "Running" as const, startedAt: timestamp };
          }
          return entry;
        })
      }));
    },
    stopTimer(timerId: string) {
      const timestamp = Date.now();
      setState((current) => ({
        ...current,
        timeEntries: current.timeEntries.map((entry) =>
          entry.id === timerId ? { ...entry, status: "Stopped" as const, elapsedSeconds: elapsedFor(entry, timestamp), startedAt: timestamp } : entry
        )
      }));
    },
    generateAiDraft(prompt: string) {
      const priorities = state.tasks
        .filter((task) => task.status !== "Done")
        .slice(0, 3)
        .map((task) => `- ${task.title} (${task.priority}, ${task.due})`)
        .join("\n");
      const aiDraft = `Draft for: ${prompt}\n\nRecommended focus:\n${priorities}\n\nSuggested update: clarify the next action, due date, and any blocker before moving forward.`;
      setState((current) => ({ ...current, aiDraft }));
    },
    setAiDraft(aiDraft: string) {
      setState((current) => ({ ...current, aiDraft }));
    },
    clearWorkspaceState() {
      setState(emptyWorkspaceState);
    },
    importWorkspaceState(value: unknown) {
      setState(normalizeState(value));
    }
  };
}

export const priorities: Priority[] = ["Low", "Medium", "High", "Urgent"];
export const recurrenceRules: RecurrenceRule[] = ["None", "Daily", "Weekly", "Monthly"];
export const taskStatuses: TaskStatus[] = ["Backlog", "Todo", "In Progress", "Pending", "Review", "Done"];

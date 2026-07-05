"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Route } from "next";
import {
  BarChart3,
  Bold,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Code2,
  Database,
  Eye,
  FileText,
  FolderKanban,
  Gamepad2,
  Heading2,
  Italic,
  Layers3,
  Link,
  List,
  ListChecks,
  Network,
  Pause,
  Pencil,
  Play,
  Plus,
  Quote,
  Rocket,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Table2,
  Target,
  Ticket,
  Timer,
  User,
  Workflow
} from "lucide-react";
import { CSSProperties, FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { CommandResult } from "@/components/layout/command-palette";
import { AuthenticatedImage } from "@/components/ui/authenticated-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { DashboardAnalytics, getDashboardAnalyticsRequest } from "@/lib/workspace/analytics-api";
import { CreateArticleInput, createArticleRequest, listArticlesRequest, mapApiArticle, updateArticleRequest } from "@/lib/workspace/article-api";
import { WorkspaceAiAnswer, requestAiSuggestion, requestWorkspaceAiAnswer } from "@/lib/workspace/ai-api";
import { useAuth } from "@/lib/auth/auth-context";
import { priorities, recurrenceRules, taskStatuses, useWorkspaceStore } from "@/lib/workspace/use-workspace-store";
import { CalendarEvent, FileAsset, KnowledgeArticle, Note, Priority, Project, RecurrenceRule, SqlSnippet, Task, TaskStatus, TaskSubtask, Template, TicketSeverity, WorkspaceState, WorkspaceView } from "@/lib/workspace/types";
import { archiveWorkspaceRequest, createWorkspaceRequest, listWorkspacesRequest, updateWorkspaceRequest, WorkspaceSummary } from "@/lib/workspace/workspace-api";
import { CreateTaskInput, createTaskRequest, listTasksRequest, mapApiTask, updateTaskRequest, updateTaskStatusRequest } from "@/lib/workspace/task-api";
import { getWorkspacePath, parseWorkspaceModuleSlug, parseWorkspaceView } from "@/lib/workspace/routes";
import { GlobalSearchResult, globalSearchRequest } from "@/lib/workspace/search-api";
import { CreateNoteInput, createNoteRequest, listNotesRequest, mapApiNote, updateNoteRequest } from "@/lib/workspace/note-api";
import { CreateProjectInput, archiveProjectRequest, createProjectRequest, listProjectsRequest, mapApiProject, unarchiveProjectRequest, updateProjectRequest } from "@/lib/workspace/project-api";
import { CreateSqlSnippetInput, createSqlSnippetRequest, listSqlSnippetsRequest, mapApiSqlSnippet, updateSqlSnippetRequest } from "@/lib/workspace/sql-api";
import { CreateCalendarEventInput, deleteCalendarEventRequest, createCalendarEventRequest, listCalendarEventsRequest, mapApiCalendarEvent, updateCalendarEventRequest, updateCalendarReminderRequest } from "@/lib/workspace/calendar-api";
import { listTimeEntriesRequest, manualTimeEntryRequest, mapApiTimeEntry, startTimeEntryRequest, stopTimeEntryRequest, toggleTimeEntryRequest } from "@/lib/workspace/time-api";
import { BackupRestoreResult, createFileAssetRequest, deleteFileAssetRequest, getFileContentUrl, getStorageUsageRequest, listFilesRequest, mapApiFileAsset, restoreBackupRequest, updateFileAssetRequest, uploadFileRequest } from "@/lib/workspace/file-api";
import { changePasswordRequest, listSessionsRequest, logoutAllDevicesRequest, updateProfileRequest } from "@/lib/auth/api";
import { CreateTemplateInput, createTemplateRequest, listTemplatesRequest, mapApiTemplate, updateTemplateRequest } from "@/lib/workspace/template-api";
import { listNotificationsRequest, sendDailySummaryRequest, sendDeadlineRemindersRequest, WorkspaceNotification } from "@/lib/workspace/notification-api";

type CreateKind = "task" | "project" | "note" | "ticket" | "sql" | "article" | "event" | "template";

const createMap: Partial<Record<WorkspaceView, CreateKind>> = {
  Dashboard: "task",
  Tasks: "task",
  Projects: "project",
  Notes: "note",
  Tickets: "ticket",
  "SQL Library": "sql",
  "Knowledge Base": "article",
  Calendar: "event",
  Templates: "template"
};

const projectIconOptions = [
  { value: "folder-kanban", label: "Project", icon: FolderKanban },
  { value: "rocket", label: "Launch", icon: Rocket },
  { value: "book-open", label: "Knowledge", icon: BookOpen },
  { value: "database", label: "Data", icon: Database },
  { value: "brain", label: "AI", icon: BrainCircuit },
  { value: "target", label: "Goal", icon: Target },
  { value: "layers", label: "Platform", icon: Layers3 },
  { value: "shield", label: "Security", icon: ShieldCheck }
];

const projectCoverPresets = [
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80"
];

const defaultDashboardWidgets = {
  tasks: true,
  weekly: true,
  projects: true,
  kanban: true,
  timer: true,
  agenda: true,
  ai: true,
  notes: true,
  files: true
};
type DashboardWidgetId = keyof typeof defaultDashboardWidgets;
const dashboardWidgetOptions: Array<{ id: DashboardWidgetId; label: string }> = [
  { id: "tasks", label: "Work queue" },
  { id: "weekly", label: "Weekly activity" },
  { id: "projects", label: "Pinned projects" },
  { id: "kanban", label: "Kanban preview" },
  { id: "timer", label: "Timer" },
  { id: "agenda", label: "Agenda" },
  { id: "ai", label: "AI suggestions" },
  { id: "notes", label: "Recent notes" },
  { id: "files", label: "Recent files" }
];

export function ProductWorkspace({ initialView = "Dashboard" }: { initialView?: WorkspaceView }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const store = useWorkspaceStore();
  const workspaceStateRef = useRef(store.state);
  const routeView = searchParams.get("view");
  const pathView = parseWorkspaceModuleSlug(pathname.split("/").filter(Boolean)[0] ?? null);
  const routeWorkspaceId = searchParams.get("workspace") ?? "";
  const currentQuery = searchParams.toString();
  const [activeView, setActiveView] = useState<WorkspaceView>(() => parseWorkspaceView(routeView) ?? pathView ?? initialView);
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [notice, setNotice] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(routeWorkspaceId);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [dashboardAnalytics, setDashboardAnalytics] = useState<DashboardAnalytics | null>(null);
  const [dashboardAnalyticsError, setDashboardAnalyticsError] = useState("");
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageConnected, setStorageConnected] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [backendCommandItems, setBackendCommandItems] = useState<CommandResult[]>([]);
  const [commandLoading, setCommandLoading] = useState(false);
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
  const [pendingFileId, setPendingFileId] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [pendingArticleId, setPendingArticleId] = useState<string | null>(null);
  const [pendingSqlId, setPendingSqlId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [answeredAssistantQuestion, setAnsweredAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState<WorkspaceAiAnswer | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [backendNotifications, setBackendNotifications] = useState<WorkspaceNotification[]>([]);
  const [appNotifications, setAppNotifications] = useState<WorkspaceNotification[]>([]);
  const [autoBackupIntervalHours, setAutoBackupIntervalHours] = useState<0 | 12 | 24>(24);
  const autoBackupInFlight = useRef(false);
  const localCommandItems = useCommandItems(store);
  const commandItems = useMemo(() => mergeCommandItems(localCommandItems, backendCommandItems), [backendCommandItems, localCommandItems]);
  const localNotifications = useWorkspaceNotifications(store);
  const shellNotifications = useMemo(() => mergeNotifications([...appNotifications, ...backendNotifications], localNotifications), [appNotifications, backendNotifications, localNotifications]);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const hasBackendWorkspace = auth.status === "authenticated" && Boolean(activeWorkspace?.id);

  useEffect(() => {
    workspaceStateRef.current = store.state;
  }, [store.state]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape" && createKind) {
        event.preventDefault();
        setCreateKind(null);
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setCreateKind(createMap[activeView] ?? "task");
      }
      if (event.key.toLowerCase() === "d") setActiveView("Dashboard");
      if (event.key.toLowerCase() === "t") setActiveView("Tasks");
      if (event.key.toLowerCase() === "p") setActiveView("Projects");
      if (event.key.toLowerCase() === "c") setActiveView("Calendar");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, createKind]);

  useEffect(() => {
    const nextView = parseWorkspaceView(routeView) ?? pathView ?? initialView;
    if (nextView && nextView !== activeView) {
      setActiveView(nextView);
    }
  }, [activeView, initialView, pathView, routeView]);

  useEffect(() => {
    if (!routeWorkspaceId || !workspaces.some((workspace) => workspace.id === routeWorkspaceId)) return;
    if (routeWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(routeWorkspaceId);
    }
  }, [activeWorkspaceId, routeWorkspaceId, workspaces]);

  useEffect(() => {
    const params = new URLSearchParams(currentQuery);
    if (auth.status === "authenticated" && activeWorkspace?.id && params.get("onboarding") === "1") {
      setOnboardingComplete(false);
    }
  }, [activeWorkspace?.id, auth.status, currentQuery]);

  useEffect(() => {
    const params = new URLSearchParams(currentQuery);
    params.delete("view");
    if (activeWorkspace?.id) {
      params.set("workspace", activeWorkspace.id);
    } else {
      params.delete("workspace");
    }

    const nextQuery = params.toString();
    const nextPath = getWorkspacePath(activeView);
    const nextUrl = nextQuery ? `${nextPath}?${nextQuery}` : nextPath;
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl as Route, { scroll: false });
    }
  }, [activeView, activeWorkspace?.id, currentQuery, pathname, router]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError("");

    listWorkspacesRequest(auth.token)
      .then((items) => {
        if (cancelled) return;
        setWorkspaces(items);
        if (items.length === 0) {
          store.clearWorkspaceState();
          setWorkspaceCreateOpen(true);
        }
        setActiveWorkspaceId((currentWorkspaceId) => {
          if (routeWorkspaceId && items.some((workspace) => workspace.id === routeWorkspaceId)) {
            return routeWorkspaceId;
          }
          if (currentWorkspaceId && items.some((workspace) => workspace.id === currentWorkspaceId)) {
            return currentWorkspaceId;
          }
          return items[0]?.id ?? "";
        });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setWorkspaces([]);
        setActiveWorkspaceId("");
        setWorkspaceError(error.message || "Workspace loading failed.");
      })
      .finally(() => {
        if (!cancelled) setWorkspaceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.token, routeWorkspaceId]);

  useEffect(() => {
    if (auth.status !== "authenticated" || !activeWorkspace?.id) {
      setBackendNotifications([]);
      return;
    }

    let cancelled = false;
    const loadNotifications = () => {
      listNotificationsRequest(auth.token, activeWorkspace.id)
        .then((items) => {
          if (!cancelled) setBackendNotifications(items);
        })
        .catch(() => {
          if (!cancelled) setBackendNotifications([]);
        });
    };

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeWorkspace?.id, auth.status, auth.token]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) {
      setTasksError("");
      setTasksLoading(false);
      return;
    }

    let cancelled = false;
    setTasksLoading(true);
    setTasksError("");

    listTasksRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) store.setTasks(items.map(mapApiTask));
      })
      .catch((error: Error) => {
        if (!cancelled) setTasksError(error.message || "Task loading failed.");
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listProjectsRequest(auth.token, activeWorkspace.id, true)
      .then((items) => {
        if (!cancelled) store.setProjects(items.map(mapApiProject));
      })
      .catch(() => {
        if (!cancelled) store.setProjects([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listSqlSnippetsRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) store.setSqlSnippets(items.map(mapApiSqlSnippet));
      })
      .catch(() => {
        if (!cancelled) store.setSqlSnippets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listCalendarEventsRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) store.setEvents(items.map(mapApiCalendarEvent));
      })
      .catch(() => {
        if (!cancelled) store.setEvents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listTimeEntriesRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) store.setTimeEntries(items.map(mapApiTimeEntry));
      })
      .catch(() => {
        if (!cancelled) store.setTimeEntries([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listFilesRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) {
          store.setFiles(items.map(mapApiFileAsset));
        }
      })
      .catch(() => {
        if (!cancelled) {
          store.setFiles([]);
          setStorageUsedBytes(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) {
      setStorageUsedBytes(0);
      setStorageConnected(true);
      setStorageError(null);
      return;
    }

    let cancelled = false;
    getStorageUsageRequest(auth.token, activeWorkspace.id)
      .then((usage) => {
        if (!cancelled) {
          setStorageUsedBytes(usage.usedBytes);
          setStorageConnected(usage.storageConnected ?? true);
          setStorageError(usage.storageError ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStorageUsedBytes(store.state.files.reduce((total, file) => total + file.size, 0));
          setStorageConnected(false);
          setStorageError("Could not check workspace storage.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace, store.state.files]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listTemplatesRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) store.setTemplates(items.map(mapApiTemplate));
      })
      .catch(() => {
        if (!cancelled) store.setTemplates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listArticlesRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) store.setArticles(items.map(mapApiArticle));
      })
      .catch(() => {
        if (!cancelled) store.setArticles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id) return;

    let cancelled = false;
    listNotesRequest(auth.token, activeWorkspace.id)
      .then((items) => {
        if (!cancelled) store.setNotes(items.map(mapApiNote));
      })
      .catch(() => {
        if (!cancelled) store.setNotes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.status, auth.token, hasBackendWorkspace]);

  useEffect(() => {
    if (!activeWorkspace?.id) {
      setDashboardAnalytics(null);
      setDashboardAnalyticsError("");
      return;
    }

    let cancelled = false;
    setDashboardAnalyticsError("");

    getDashboardAnalyticsRequest(auth.token, activeWorkspace.id)
      .then((analytics) => {
        if (!cancelled) setDashboardAnalytics(analytics);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setDashboardAnalytics(null);
          setDashboardAnalyticsError(error.message || "Dashboard analytics failed.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, auth.token, store.state.tasks, store.state.timeEntries]);

  useEffect(() => {
    const query = commandQuery.trim();
    if (!activeWorkspace?.id || query.length < 2) {
      setBackendCommandItems([]);
      setCommandLoading(false);
      return;
    }

    let cancelled = false;
    setCommandLoading(true);
    const timeout = window.setTimeout(() => {
      globalSearchRequest(auth.token, activeWorkspace.id, query)
        .then((results) => {
          if (!cancelled) setBackendCommandItems(results.map(mapSearchResultToCommand));
        })
        .catch(() => {
          if (!cancelled) setBackendCommandItems([]);
        })
        .finally(() => {
          if (!cancelled) setCommandLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [activeWorkspace?.id, auth.token, commandQuery]);

  useEffect(() => {
    if (!hasBackendWorkspace || !activeWorkspace?.id || autoBackupIntervalHours === 0) return;

    let cancelled = false;
    const intervalMs = autoBackupIntervalHours * 60 * 60 * 1000;
    const checkIntervalMs = Math.min(intervalMs, 60 * 60 * 1000);

    async function maybeCreateAutomaticBackup() {
      if (cancelled || autoBackupInFlight.current) return;
      const latestBackupAt = getLatestBackupCreatedAt(workspaceStateRef.current.files);
      if (latestBackupAt && Date.now() - latestBackupAt < intervalMs) return;

      autoBackupInFlight.current = true;
      try {
        await createWorkspaceBackup("automatic");
        if (!cancelled) {
          setNotice("Automatic workspace backup saved.");
          window.setTimeout(() => setNotice(""), 2600);
        }
      } catch (error) {
        if (!cancelled) {
          setStorageConnected(false);
          setStorageError(error instanceof Error ? error.message : "Automatic workspace backup failed.");
        }
      } finally {
        autoBackupInFlight.current = false;
      }
    }

    const firstCheck = window.setTimeout(() => void maybeCreateAutomaticBackup(), 60_000);
    const interval = window.setInterval(() => void maybeCreateAutomaticBackup(), checkIntervalMs);
    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [activeWorkspace?.id, activeWorkspace?.name, activeWorkspace?.slug, auth.token, autoBackupIntervalHours, hasBackendWorkspace]);

  function requireWorkspaceId() {
    if (!hasBackendWorkspace || !activeWorkspace?.id) {
      throw new Error("Create or select a workspace before changing workspace data.");
    }
    return activeWorkspace.id;
  }

  async function createTask(input: CreateTaskInput) {
    const workspaceId = requireWorkspaceId();
    const createdTask = await createTaskRequest(auth.token, workspaceId, input);
    store.upsertTask(mapApiTask(createdTask));
  }

  async function persistTaskStatus(taskId: string, status: TaskStatus, previousStatus?: TaskStatus) {
    const task = store.state.tasks.find((item) => item.id === taskId);
    requireWorkspaceId();
    const nextTask = task && status === "Done" ? withDerivedTaskFields({ ...task, status, subtasks: task.subtasks.map((subtask) => ({ ...subtask, status: "Done" as const })) }) : task ? withDerivedTaskFields({ ...task, status }) : null;
    if (nextTask && taskRequiresOverdueReason(nextTask)) {
      setNotice("Open task details and add an overdue reason before changing this past-due task.");
      window.setTimeout(() => setNotice(""), 3000);
      throw new Error("Past-due tasks require an overdue reason.");
    }
    if (nextTask) {
      const updatedTask = await updateTaskRequest(auth.token, nextTask);
      store.upsertTask(mapApiTask(updatedTask));
    } else {
      await updateTaskStatusRequest(auth.token, taskId, status);
    }
    if (task && status === "Done" && previousStatus !== "Done" && task.recurringRule !== "None") {
      try {
        await createTask(createNextRecurringTaskInput(task));
      } catch (error) {
        setNotice(error instanceof Error ? `Task completed, but recurrence failed: ${error.message}` : "Task completed, but recurrence failed.");
        window.setTimeout(() => setNotice(""), 2800);
      }
    }
  }

  async function persistTask(inputTask: Task) {
    requireWorkspaceId();
    const task = withDerivedTaskFields(inputTask);
    const updatedTask = await updateTaskRequest(auth.token, task);
    store.upsertTask(mapApiTask(updatedTask));
  }

  async function createArticle(input: CreateArticleInput) {
    const workspaceId = requireWorkspaceId();
    const createdArticle = await createArticleRequest(auth.token, workspaceId, input);
    store.upsertArticle(mapApiArticle(createdArticle));
  }

  async function persistArticle(article: KnowledgeArticle) {
    requireWorkspaceId();
    store.upsertArticle(article);
    const updatedArticle = await updateArticleRequest(auth.token, article);
    store.upsertArticle(mapApiArticle(updatedArticle));
  }

  async function createNote(input: CreateNoteInput) {
    const workspaceId = requireWorkspaceId();
    const createdNote = await createNoteRequest(auth.token, workspaceId, input);
    store.upsertNote(mapApiNote(createdNote));
  }

  async function createProject(input: CreateProjectInput) {
    const workspaceId = requireWorkspaceId();
    const createdProject = await createProjectRequest(auth.token, workspaceId, input);
    store.upsertProject(mapApiProject(createdProject));
  }

  async function persistProject(project: Project) {
    requireWorkspaceId();
    store.upsertProject(project);
    const updatedProject = await updateProjectRequest(auth.token, project);
    store.upsertProject(mapApiProject(updatedProject));
  }

  async function archiveProject(project: Project) {
    const archivedProject = { ...project, archived: true, pinned: false };
    requireWorkspaceId();
    store.upsertProject(archivedProject);
    const archived = await archiveProjectRequest(auth.token, project.id);
    store.upsertProject(mapApiProject(archived));
  }

  async function unarchiveProject(project: Project) {
    const activeProject = { ...project, archived: false };
    requireWorkspaceId();
    store.upsertProject(activeProject);
    const restored = await unarchiveProjectRequest(auth.token, project.id);
    store.upsertProject(mapApiProject(restored));
  }

  async function saveWorkspaceSettings(input: { name?: string; slug?: string; icon?: string; color?: string }) {
    const workspaceId = requireWorkspaceId();
    const updatedWorkspace = await updateWorkspaceRequest(auth.token, workspaceId, input);
    setWorkspaces((current) => current.map((workspace) => (workspace.id === updatedWorkspace.id ? updatedWorkspace : workspace)));
  }

  async function createWorkspace(input: { name: string; slug: string; icon?: string; color?: string }) {
    const createdWorkspace = await createWorkspaceRequest(auth.token, input);
    setWorkspaces((current) => [createdWorkspace, ...current]);
    setActiveWorkspaceId(createdWorkspace.id);
    setWorkspaceCreateOpen(false);
    setOnboardingComplete(true);
    setNotice(`Created workspace ${createdWorkspace.name}.`);
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function archiveActiveWorkspace() {
    const workspaceId = requireWorkspaceId();
    await archiveWorkspaceRequest(auth.token, workspaceId);
    const remaining = workspaces.filter((workspace) => workspace.id !== activeWorkspace.id);
    setWorkspaces(remaining);
    setActiveWorkspaceId(remaining[0]?.id ?? "");
    if (remaining.length === 0) setWorkspaceCreateOpen(true);
  }

  async function persistNote(note: Note) {
    requireWorkspaceId();
    store.updateNote(note);
    const updatedNote = await updateNoteRequest(auth.token, note);
    store.upsertNote(mapApiNote(updatedNote));
  }

  async function createSqlSnippet(input: CreateSqlSnippetInput) {
    const workspaceId = requireWorkspaceId();
    const createdSnippet = await createSqlSnippetRequest(auth.token, workspaceId, input);
    store.upsertSqlSnippet(mapApiSqlSnippet(createdSnippet));
  }

  async function persistSqlSnippet(snippet: SqlSnippet) {
    requireWorkspaceId();
    store.updateSqlSnippet(snippet);
    await updateSqlSnippetRequest(auth.token, snippet);
  }

  async function createCalendarEvent(input: CreateCalendarEventInput) {
    const workspaceId = requireWorkspaceId();
    const createdEvent = await createCalendarEventRequest(auth.token, workspaceId, input);
    store.upsertEvent(mapApiCalendarEvent(createdEvent));
  }

  async function persistEventReminder(event: CalendarEvent, reminderEnabled: boolean, reminderMinutes: number) {
    const nextEvent = { ...event, reminderEnabled, reminderMinutes };
    requireWorkspaceId();
    store.setEventReminder(event.id, reminderEnabled, reminderMinutes);
    const updatedEvent = await updateCalendarReminderRequest(auth.token, nextEvent);
    store.upsertEvent(mapApiCalendarEvent(updatedEvent));
  }

  async function persistCalendarEvent(event: CalendarEvent) {
    requireWorkspaceId();
    store.updateEvent(event);
    const updatedEvent = await updateCalendarEventRequest(auth.token, event);
    store.upsertEvent(mapApiCalendarEvent(updatedEvent));
  }

  async function deleteCalendarEvent(event: CalendarEvent) {
    requireWorkspaceId();
    store.deleteEvent(event.id);
    await deleteCalendarEventRequest(auth.token, event.id);
  }

  async function createFileAsset(input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) {
    if (file) {
      const workspaceId = requireWorkspaceId();
      const uploadedFile = await uploadFileRequest(auth.token, workspaceId, input, file);
      const mappedFile = mapApiFileAsset(uploadedFile);
      store.upsertFileAsset(mappedFile);
      setStorageUsedBytes((currentBytes) => Math.max(currentBytes + mappedFile.size, mappedFile.size));
      setStorageConnected(true);
      setStorageError(null);
      return;
    }

    const workspaceId = requireWorkspaceId();
    const createdFile = await createFileAssetRequest(auth.token, workspaceId, input);
    const mappedFile = mapApiFileAsset(createdFile);
    store.upsertFileAsset(mappedFile);
    setStorageUsedBytes((currentBytes) => Math.max(currentBytes + mappedFile.size, mappedFile.size));
    setStorageConnected(true);
    setStorageError(null);
  }

  async function refreshWorkspaceData(workspaceId = requireWorkspaceId()) {
    const [
      tasks,
      projects,
      sqlSnippets,
      events,
      timeEntries,
      files,
      templates,
      articles,
      notes,
      analytics,
      usage
    ] = await Promise.all([
      listTasksRequest(auth.token, workspaceId),
      listProjectsRequest(auth.token, workspaceId, true),
      listSqlSnippetsRequest(auth.token, workspaceId),
      listCalendarEventsRequest(auth.token, workspaceId),
      listTimeEntriesRequest(auth.token, workspaceId),
      listFilesRequest(auth.token, workspaceId),
      listTemplatesRequest(auth.token, workspaceId),
      listArticlesRequest(auth.token, workspaceId),
      listNotesRequest(auth.token, workspaceId),
      getDashboardAnalyticsRequest(auth.token, workspaceId).catch(() => null),
      getStorageUsageRequest(auth.token, workspaceId).catch(() => null)
    ]);

    store.setTasks(tasks.map(mapApiTask));
    store.setProjects(projects.map(mapApiProject));
    store.setSqlSnippets(sqlSnippets.map(mapApiSqlSnippet));
    store.setEvents(events.map(mapApiCalendarEvent));
    store.setTimeEntries(timeEntries.map(mapApiTimeEntry));
    store.setFiles(files.map(mapApiFileAsset));
    store.setTemplates(templates.map(mapApiTemplate));
    store.setArticles(articles.map(mapApiArticle));
    store.setNotes(notes.map(mapApiNote));
    if (analytics) setDashboardAnalytics(analytics);
    if (usage) {
      setStorageUsedBytes(usage.usedBytes);
      setStorageConnected(usage.storageConnected ?? true);
      setStorageError(usage.storageError ?? null);
    }
  }

  async function createWorkspaceBackup(reason: "manual" | "automatic" = "manual") {
    const workspaceId = requireWorkspaceId();
    const createdAt = new Date();
    const snapshot = {
      app: "what's next?",
      kind: "workspace-backup",
      version: 1,
      reason,
      workspaceId,
      workspaceName: activeWorkspace?.name ?? "Workspace",
      createdAt: createdAt.toISOString(),
      state: workspaceStateRef.current
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const safeWorkspaceName = (activeWorkspace?.slug || activeWorkspace?.name || "workspace").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
    const name = `whats-next-backup-${safeWorkspaceName}-${timestamp}.json`;
    const backupFile = new File([blob], name, { type: "application/json" });
    const backup = await uploadFileRequest(auth.token, workspaceId, {
      name,
      type: "application/json",
      size: blob.size,
      linkedType: "Backup"
    }, backupFile);
    const mappedFile = mapApiFileAsset(backup);
    store.upsertFileAsset(mappedFile);
    setStorageUsedBytes((currentBytes) => Math.max(currentBytes + mappedFile.size, mappedFile.size));
    setStorageConnected(true);
    setStorageError(null);
    return mappedFile;
  }

  async function restoreWorkspaceBackup(file: FileAsset) {
    requireWorkspaceId();
    const result = await restoreBackupRequest(auth.token, file.id);
    await refreshWorkspaceData();
    return result;
  }

  async function deleteFileAsset(file: FileAsset) {
    requireWorkspaceId();
    store.deleteFileAsset(file.id);
    await deleteFileAssetRequest(auth.token, file.id);
  }

	  async function updateFileAsset(file: FileAsset, input: { name?: string; linkedType?: FileAsset["linkedType"]; linkedId?: string }) {
	    const nextFile = {
	      ...file,
	      name: input.name ?? file.name,
	      linkedType: input.linkedType ?? file.linkedType,
	      linkedId: input.linkedId ?? file.linkedId
	    };
	    requireWorkspaceId();
	    store.upsertFileAsset(nextFile);
	    const updatedFile = await updateFileAssetRequest(auth.token, file.id, {
	      name: nextFile.name,
	      entityType: nextFile.linkedType,
	      entityId: nextFile.linkedType === "None" ? undefined : nextFile.linkedId
	    });
	    store.upsertFileAsset(mapApiFileAsset(updatedFile));
	  }

	  async function createTemplate(input: CreateTemplateInput) {
    const workspaceId = requireWorkspaceId();
    const createdTemplate = await createTemplateRequest(auth.token, workspaceId, input);
    store.upsertTemplate(mapApiTemplate(createdTemplate));
  }

  async function persistTemplate(template: Template) {
    requireWorkspaceId();
    store.upsertTemplate(template);
    const updatedTemplate = await updateTemplateRequest(auth.token, template);
    store.upsertTemplate(mapApiTemplate(updatedTemplate));
  }

  async function startTimeEntry(title: string, taskId?: string) {
    const workspaceId = requireWorkspaceId();
    const entry = await startTimeEntryRequest(auth.token, workspaceId, title, taskId);
    store.upsertTimeEntry(mapApiTimeEntry(entry));
  }

  async function addManualTimeEntry(title: string, minutes: number, taskId?: string) {
    const workspaceId = requireWorkspaceId();
    const entry = await manualTimeEntryRequest(auth.token, workspaceId, title, minutes, taskId);
    store.upsertTimeEntry(mapApiTimeEntry(entry));
  }

  async function toggleTimeEntry(timerId: string) {
    requireWorkspaceId();
    const entry = await toggleTimeEntryRequest(auth.token, timerId);
    store.upsertTimeEntry(mapApiTimeEntry(entry));
  }

  async function stopTimeEntry(timerId: string) {
    requireWorkspaceId();
    const entry = await stopTimeEntryRequest(auth.token, timerId);
    store.upsertTimeEntry(mapApiTimeEntry(entry));
  }

  async function createTicketArticle(task: Task) {
    const articleInput = createArticleFromTicketTask(task);
    const existingArticle = findArticleForTicketTask(store.state.articles, task);
    if (existingArticle) {
      await persistArticle({
        ...existingArticle,
        ...articleInput,
        tags: uniqueStrings([...existingArticle.tags, ...(articleInput.tags ?? [])]),
        references: uniqueStrings([...existingArticle.references, ...(articleInput.references ?? [])])
      });
      setNotice("Ticket knowledge article updated.");
    } else {
      await createArticle(articleInput);
      setNotice("Ticket promoted to knowledge article.");
    }
    window.setTimeout(() => setNotice(""), 2400);
  }

  async function generateAssistantDraft(prompt: string) {
    requireWorkspaceId();
    const workspacePrompt = buildWorkspaceAiPrompt(prompt, store.state);
    const response = await requestAiSuggestion(auth.token, workspacePrompt);
    store.setAiDraft(response.content);
    return response.content;
  }

  async function askWorkspaceKnowledge(question: string) {
    const workspaceId = requireWorkspaceId();
    return requestWorkspaceAiAnswer(auth.token, workspaceId, question);
  }

  async function askGlobalAssistant() {
    if (!assistantQuestion.trim() || assistantLoading) return;
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantAnswer(null);
    try {
      const question = assistantQuestion.trim();
      const answer = await askWorkspaceKnowledge(question);
      setAssistantAnswer(answer);
      setAnsweredAssistantQuestion(question);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Workspace AI search failed.");
    } finally {
      setAssistantLoading(false);
    }
  }

  function closeAssistantForNavigation() {
    setAssistantOpen(false);
  }

  function openAssistantTask(taskId: string) {
    setPendingTaskId(taskId);
    setActiveView("Tasks");
    closeAssistantForNavigation();
  }

  function openAssistantArticle(articleId: string) {
    setPendingArticleId(articleId);
    setActiveView("Knowledge Base");
    closeAssistantForNavigation();
  }

  function openAssistantNote(noteId: string) {
    setPendingNoteId(noteId);
    setActiveView("Notes");
    closeAssistantForNavigation();
  }

  function openAssistantSql(snippetId: string) {
    setPendingSqlId(snippetId);
    setActiveView("SQL Library");
    closeAssistantForNavigation();
  }

  function openAssistantFile(fileId: string) {
    setPendingFileId(fileId);
    setActiveView("Files");
    closeAssistantForNavigation();
  }

  async function completeOnboarding(input: { name: string; icon: string; color: string; defaultView: WorkspaceView }) {
    const workspaceId = requireWorkspaceId();
    const slug = input.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || activeWorkspace?.slug || "workspace";
    const updatedWorkspace = await updateWorkspaceRequest(auth.token, workspaceId, {
      name: input.name,
      slug,
      icon: input.icon,
      color: input.color
    });
    setWorkspaces((current) => current.map((workspace) => (workspace.id === updatedWorkspace.id ? updatedWorkspace : workspace)));
    setActiveView(input.defaultView);
    setOnboardingComplete(true);
    clearOnboardingQuery();
  }

  function clearOnboardingQuery() {
    const params = new URLSearchParams(currentQuery);
    params.delete("onboarding");
    const nextQuery = params.toString();
    router.replace((nextQuery ? `${pathname}?${nextQuery}` : pathname) as Route, { scroll: false });
  }

  async function handleCommand(item: CommandResult) {
    if (!item.action) {
      setActiveView(item.view);
      return;
    }

    if (item.action === "create-task") {
      setActiveView("Tasks");
      setCreateKind("task");
      return;
    }

    if (item.action === "create-note") {
      setActiveView("Notes");
      setCreateKind("note");
      return;
    }

    if (item.action === "start-timer") {
      await startTimeEntry("Focused work");
      setActiveView("Time Tracker");
      setNotice("Focus timer started.");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }

    if (item.action === "ai-search") {
      setAssistantQuestion(commandQuery.trim() || assistantQuestion || "Search my workspace and suggest the most relevant tasks, notes, SQL snippets, and projects.");
      setAssistantOpen(true);
      return;
    }

    if (item.action === "switch-workspace") {
      const nextWorkspace = workspaces.find((workspace) => workspace.id !== activeWorkspace?.id) ?? workspaces[0];
      if (nextWorkspace) {
        setActiveWorkspaceId(nextWorkspace.id);
        setNotice(`Switched to ${nextWorkspace.name}.`);
        window.setTimeout(() => setNotice(""), 2200);
      }
      return;
    }

    if (item.action === "toggle-theme") {
      setNotice("Theme toggled.");
      window.setTimeout(() => setNotice(""), 1600);
      return;
    }

    if (item.action === "copy-template") {
      const template = store.state.templates.find((candidate) => candidate.id === item.entityId);
      if (!template) return;
      await copyTextToClipboard(template.body, setNotice);
      return;
    }

    if (item.action === "generate-daily-summary") {
      setActiveView("Dashboard");
      await generateAssistantDraft("Create a concise daily workspace summary with priorities, blockers, and next actions.");
      setNotice("Daily summary generated.");
      window.setTimeout(() => setNotice(""), 2200);
    }
  }

  function pushAppNotification(input: Pick<WorkspaceNotification, "title" | "body" | "tone">) {
    const notification: WorkspaceNotification = {
      id: `app-${Date.now()}`,
      title: input.title,
      body: input.body,
      tone: input.tone,
      createdAt: new Date().toISOString(),
      source: "workspace"
    };
    setAppNotifications((current) => [notification, ...current].slice(0, 12));
  }

  return (
    <WorkspaceShell
      activeView={activeView}
      onNavigate={setActiveView}
      onCreate={() => setCreateKind(createMap[activeView] ?? "task")}
      onCommand={(item) => void handleCommand(item)}
      onCommandQueryChange={setCommandQuery}
      commandLoading={commandLoading}
      commandItems={commandItems}
      user={auth.user}
      authToken={auth.token}
      workspaceName={activeWorkspace?.name ?? "Workspace"}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspace?.id}
      onWorkspaceChange={setActiveWorkspaceId}
      onWorkspaceCreate={() => setWorkspaceCreateOpen(true)}
      onOpenAssistant={() => setAssistantOpen(true)}
      workspaceLoading={workspaceLoading}
      notifications={shellNotifications}
      storageUsedBytes={storageUsedBytes}
      storageConnected={storageConnected}
      storageError={storageError}
      onLogout={() => {
        auth.logout();
        router.replace("/login");
      }}
    >
      <GlobalWorkspaceAssistant
        open={assistantOpen}
        question={assistantQuestion}
        setQuestion={setAssistantQuestion}
        answeredQuestion={answeredAssistantQuestion}
        answer={assistantAnswer}
        loading={assistantLoading}
        error={assistantError}
        store={store}
        onClose={() => setAssistantOpen(false)}
        onAsk={() => void askGlobalAssistant()}
        onOpenTask={openAssistantTask}
        onOpenArticle={openAssistantArticle}
        onOpenNote={openAssistantNote}
        onOpenSql={openAssistantSql}
        onOpenFile={openAssistantFile}
        onOpenTimeTracker={() => {
          setActiveView("Time Tracker");
          closeAssistantForNavigation();
        }}
      />
      {workspaceError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {workspaceError}
        </div>
      )}
      {workspaceCreateOpen && <WorkspaceCreateDialog onClose={() => setWorkspaceCreateOpen(false)} onCreate={createWorkspace} />}
      {!onboardingComplete && activeWorkspace && (
        <OnboardingView workspace={activeWorkspace} onComplete={(input) => void completeOnboarding(input)} onSkip={() => {
          setOnboardingComplete(true);
          clearOnboardingQuery();
        }} />
      )}
      {onboardingComplete && (
        <>
      <AnimatePresence mode="wait">
        <motion.div key={activeView} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          {activeView === "Dashboard" && <DashboardView store={store} setActiveView={setActiveView} openCreate={setCreateKind} onTaskStatusChange={persistTaskStatus} onTaskUpdate={persistTask} onGenerateAiDraft={generateAssistantDraft} analytics={dashboardAnalytics} analyticsError={dashboardAnalyticsError} onTimerStart={startTimeEntry} onTimerToggle={toggleTimeEntry} onTimerStop={stopTimeEntry} onOpenNote={(noteId) => { setPendingNoteId(noteId); setActiveView("Notes"); }} onOpenFile={(fileId) => { setPendingFileId(fileId); setActiveView("Files"); }} onFileCreate={createFileAsset} />}
          {activeView === "Workspace" && <WorkspacesView store={store} workspaces={workspaces} activeWorkspaceId={activeWorkspace?.id} onWorkspaceChange={setActiveWorkspaceId} onWorkspaceCreate={() => setWorkspaceCreateOpen(true)} activeWorkspace={activeWorkspace} onWorkspaceSave={saveWorkspaceSettings} onWorkspaceArchive={archiveActiveWorkspace} />}
          {activeView === "Tasks" && <TasksView store={store} openCreate={setCreateKind} onTaskStatusChange={persistTaskStatus} onTaskUpdate={persistTask} onPromoteTicket={createTicketArticle} onFileCreate={createFileAsset} loading={tasksLoading} error={tasksError} initialTaskId={pendingTaskId} onInitialTaskHandled={() => setPendingTaskId(null)} />}
          {activeView === "Projects" && <ProjectsView store={store} openCreate={setCreateKind} onProjectSave={persistProject} onProjectArchive={archiveProject} onProjectUnarchive={unarchiveProject} />}
          {activeView === "Tickets" && <TicketsView store={store} openCreate={setCreateKind} onTaskStatusChange={persistTaskStatus} onTaskUpdate={persistTask} onPromoteTicket={createTicketArticle} onFileCreate={createFileAsset} />}
          {activeView === "Knowledge Base" && <KnowledgeView store={store} openCreate={setCreateKind} onArticleSave={persistArticle} onTaskStatusChange={persistTaskStatus} onTaskUpdate={persistTask} onPromoteTicket={createTicketArticle} onFileCreate={createFileAsset} onNoteSave={persistNote} onSqlSave={persistSqlSnippet} onFileUpdate={updateFileAsset} onFileDelete={deleteFileAsset} onGenerateAiDraft={generateAssistantDraft} initialArticleId={pendingArticleId} onInitialArticleHandled={() => setPendingArticleId(null)} />}
          {activeView === "Notes" && <NotesView store={store} openCreate={setCreateKind} onNoteCreate={createNote} onNoteSave={persistNote} initialNoteId={pendingNoteId} onInitialNoteHandled={() => setPendingNoteId(null)} />}
          {activeView === "SQL Library" && <SqlView store={store} openCreate={setCreateKind} notify={setNotice} onSqlSave={persistSqlSnippet} initialSnippetId={pendingSqlId} onInitialSnippetHandled={() => setPendingSqlId(null)} />}
          {activeView === "Calendar" && <CalendarView store={store} openCreate={setCreateKind} onReminderChange={persistEventReminder} onEventSave={persistCalendarEvent} onEventDelete={deleteCalendarEvent} onTaskUpdate={persistTask} onFileCreate={createFileAsset} />}
          {activeView === "Time Tracker" && <TimeView store={store} onStart={startTimeEntry} onManualEntry={addManualTimeEntry} onToggle={toggleTimeEntry} onStop={stopTimeEntry} />}
          {activeView === "Templates" && <TemplatesView store={store} openCreate={setCreateKind} notify={setNotice} onTemplateSave={persistTemplate} />}
          {activeView === "Analytics" && <AnalyticsView store={store} />}
          {activeView === "Files" && <FilesView store={store} notify={setNotice} initialFileId={pendingFileId} onInitialFileHandled={() => setPendingFileId(null)} onFileCreate={createFileAsset} onFileDelete={deleteFileAsset} onFileUpdate={updateFileAsset} />}
          {activeView === "Personal" && <PersonalView store={store} openCreate={setCreateKind} openTasks={() => setActiveView("Tasks")} />}
          {activeView === "Gaming" && <GamingView store={store} openCreate={setCreateKind} openTasks={() => setActiveView("Tasks")} />}
          {activeView === "Settings" && (
            <UtilityView
              title={activeView}
              store={store}
              notify={setNotice}
              user={auth.user}
              token={auth.token}
              activeWorkspace={activeWorkspace}
              onWorkspaceSave={saveWorkspaceSettings}
              onWorkspaceArchive={archiveActiveWorkspace}
              onProfileSaved={auth.updateUser}
              onBackupCreate={createWorkspaceBackup}
              onBackupRestore={restoreWorkspaceBackup}
              autoBackupIntervalHours={autoBackupIntervalHours}
              onAutoBackupIntervalChange={setAutoBackupIntervalHours}
              onTestNotification={pushAppNotification}
              onDailySummarySend={async () => {
                if (!activeWorkspace?.id) throw new Error("No active workspace selected.");
                const result = await sendDailySummaryRequest(auth.token, activeWorkspace.id);
                setBackendNotifications(await listNotificationsRequest(auth.token, activeWorkspace.id));
                return result;
              }}
              onDeadlineRemindersSend={async () => {
                if (!activeWorkspace?.id) throw new Error("No active workspace selected.");
                const result = await sendDeadlineRemindersRequest(auth.token, activeWorkspace.id);
                setBackendNotifications(await listNotificationsRequest(auth.token, activeWorkspace.id));
                return result;
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
      <CreateDialog kind={createKind} workspaceName={activeWorkspace?.name ?? "Workspace"} onClose={() => setCreateKind(null)} store={store} notify={setNotice} onCreateTask={createTask} onCreateArticle={createArticle} onCreateNote={createNote} onCreateProject={createProject} onCreateSql={createSqlSnippet} onCreateEvent={createCalendarEvent} onCreateTemplate={createTemplate} />
      {notice && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-2xl" role="status">
          {notice}
        </div>
      )}
        </>
      )}
    </WorkspaceShell>
  );
}

function OnboardingView({
  workspace,
  onComplete,
  onSkip
}: {
  workspace: WorkspaceSummary;
  onComplete: (input: { name: string; icon: string; color: string; defaultView: WorkspaceView }) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [category, setCategory] = useState("Work");
  const [icon, setIcon] = useState(workspace.icon ?? "briefcase");
  const [color, setColor] = useState(workspace.color ?? "#4F46E5");
  const [defaultView, setDefaultView] = useState<WorkspaceView>("Tasks");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <Badge>First setup</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-normal">Set up your workspace</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose the basics What's Next? should use for daily planning, navigation, and workspace identity.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Workspace Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <LabeledField label="Workspace name">
              <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <div className="grid gap-3 sm:grid-cols-3">
              <LabeledField label="Category">
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {["Work", "Personal", "Learning", "Fitness", "Gaming", "Travel", "Finance", "Custom"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </LabeledField>
              <LabeledField label="Default view">
                <select value={defaultView} onChange={(event) => setDefaultView(event.target.value as WorkspaceView)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {(["Dashboard", "Tasks", "Calendar", "Projects"] as WorkspaceView[]).map((view) => <option key={view}>{view}</option>)}
                </select>
              </LabeledField>
              <LabeledField label="Color">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background p-1" />
              </LabeledField>
            </div>
            <LabeledField label="Icon">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {projectIconOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button key={option.value} type="button" aria-label={option.label} onClick={() => setIcon(option.value)} className={cn("flex h-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary", icon === option.value && "border-primary bg-primary/10 text-primary ring-2 ring-primary/20")}>
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </LabeledField>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onComplete({ name: name.trim() || workspace.name, icon, color, defaultView })}>Finish setup</Button>
              <Button variant="ghost" onClick={onSkip}>Skip</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-border bg-background p-4">
              <ProjectIconTile icon={icon} className="h-14 w-14 text-white" style={{ backgroundColor: color }} />
              <h2 className="mt-4 text-xl font-semibold">{name || workspace.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{category} workspace, opening to {defaultView}.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WorkspaceCreateDialog({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (input: { name: string; slug: string; icon?: string; color?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("New Workspace");
  const [slug, setSlug] = useState("new-workspace");
  const [icon, setIcon] = useState("briefcase");
  const [color, setColor] = useState("#4F46E5");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateName(value: string) {
    setName(value);
    setSlug(slugifyWorkspace(value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Workspace name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), slug: slugifyWorkspace(slug || name), icon, color });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create workspace.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <form onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Create workspace</h2>
            <p className="mt-1 text-sm text-muted-foreground">Start a separate space for work, personal projects, learning, or anything else.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="grid gap-4">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          <LabeledField label="Workspace name">
            <input value={name} onChange={(event) => updateName(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" autoFocus />
          </LabeledField>
          <LabeledField label="Slug">
            <input value={slug} onChange={(event) => setSlug(slugifyWorkspace(event.target.value))} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </LabeledField>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label="Icon">
              <select value={icon} onChange={(event) => setIcon(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="briefcase">Briefcase</option>
                <option value="user">Personal</option>
                <option value="book-open">Learning</option>
                <option value="gamepad">Gaming</option>
                <option value="database">Data</option>
              </select>
            </LabeledField>
            <LabeledField label="Color">
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background p-1" />
            </LabeledField>
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create workspace"}</Button>
        </div>
      </form>
    </div>
  );
}

function slugifyWorkspace(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
}

function DashboardView({
  store,
  setActiveView,
  openCreate,
  onTaskStatusChange,
  onTaskUpdate,
  onGenerateAiDraft,
  analytics,
  analyticsError,
  onTimerStart,
  onTimerToggle,
	  onTimerStop,
	  onOpenNote,
	  onOpenFile,
	  onFileCreate
	}: ViewProps & {
  setActiveView: (view: WorkspaceView) => void;
  onTaskStatusChange?: (taskId: string, status: TaskStatus, previousStatus?: TaskStatus) => Promise<void>;
  onTaskUpdate?: (task: Task) => Promise<void>;
  onGenerateAiDraft?: (prompt: string) => Promise<string>;
  analytics?: DashboardAnalytics | null;
  analyticsError?: string;
  onTimerStart?: (title: string, taskId?: string) => Promise<void>;
  onTimerToggle?: (timerId: string) => Promise<void>;
	  onTimerStop?: (timerId: string) => Promise<void>;
	  onOpenNote?: (noteId: string) => void;
	  onOpenFile?: (fileId: string) => void;
	  onFileCreate?: (input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) => Promise<void>;
}) {
  const chartData = useChartData(store, analytics?.weeklyProgress);
  const todayTasks = store.state.tasks.filter((task) => task.status !== "Done").slice(0, 4);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const { widgets, setWidget, resetWidgets } = useDashboardWidgets();
  const analyticsFocusSeconds = analytics?.weeklyProgress.reduce((total, item) => total + (item.focusedSeconds ?? item.focusedMinutes * 60), 0);
  const focusSeconds = Math.max(analyticsFocusSeconds ?? 0, store.metrics.focusSeconds);
  const dashboardMetrics = {
    openTasks: analytics?.counts.openTasks ?? store.metrics.openTasks,
    completedTasks: analytics?.counts.completedTasks ?? store.metrics.completedTasks,
    activeTickets: analytics?.counts.tickets ?? store.metrics.activeTickets,
    overdueTasks: analytics?.counts.overdueTasks ?? store.state.tasks.filter((task) => isTaskOverdue(task)).length,
    dueThisWeek: analytics?.counts.dueThisWeek ?? getTasksDueInRange(store.state.tasks, getCurrentWeekRange()).filter((task) => task.status !== "Done").length,
    pendingTasks: analytics?.counts.pendingTasks ?? store.state.tasks.filter((task) => task.status === "Pending").length,
    inProgressTasks: analytics?.counts.inProgressTasks ?? store.state.tasks.filter((task) => task.status === "In Progress").length,
    focusSeconds
  };
  const selectedTask = store.state.tasks.find((task) => task.id === selectedTaskId) ?? null;

  function updateDashboardTask(previousTask: Task, nextTask: Task) {
    store.upsertTask(nextTask);
    onTaskUpdate?.(nextTask).catch(() => store.upsertTask(previousTask));
  }

  async function summarizeDashboard() {
    setSummaryError("");
    setSummaryLoading(true);
    try {
      if (!onGenerateAiDraft) throw new Error("AI summaries require a backend workspace.");
      await onGenerateAiDraft("Daily workspace summary");
    } catch (error) {
      setSummaryError(formatAiErrorMessage(error));
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200">
                  {analytics ? "Backend analytics" : "Live workspace"}
                </Badge>
                <Badge>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</Badge>
                {analyticsError && <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">Using loaded metrics</Badge>}
              </div>
              <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">Your workspace is interactive now.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Create tasks, move work, run timers, copy SQL, draft notes, and jump through modules from the sidebar or command palette.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-56">
              <Button className="justify-start" onClick={() => openCreate("task")}>
                <Plus className="h-4 w-4" />
                Capture task
              </Button>
              <Button className="justify-start" variant="outline" onClick={() => setCustomizeOpen((value) => !value)}>
                <Settings className="h-4 w-4" />
                Customize
              </Button>
              <Button className="justify-start" variant="outline" disabled={summaryLoading} onClick={() => void summarizeDashboard()}>
                <Sparkles className="h-4 w-4" />
                {summaryLoading ? "Summarizing..." : "Summarize"}
              </Button>
            </div>
          </div>
          {summaryError && <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{summaryError}</div>}
          {customizeOpen && (
            <div className="mt-6 rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Dashboard widgets</p>
                <Button variant="ghost" size="sm" onClick={resetWidgets}>Reset</Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {dashboardWidgetOptions.map((option) => (
                  <label key={option.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={widgets[option.id]}
                      onChange={(event) => setWidget(option.id, event.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric title="Open Tasks" value={String(dashboardMetrics.openTasks)} detail={`${dashboardMetrics.dueThisWeek} due this week`} icon={Workflow} tone="indigo" onClick={() => setActiveView("Tasks")} />
          <Metric title="Focus Time" value={formatCompactDuration(dashboardMetrics.focusSeconds)} detail={`${formatCompactDuration(dashboardMetrics.focusSeconds)} tracked`} icon={Timer} tone="emerald" onClick={() => setActiveView("Time Tracker")} />
          <Metric title="Tickets" value={String(dashboardMetrics.activeTickets)} detail="active support items" icon={Ticket} tone="amber" onClick={() => setActiveView("Tickets")} />
          <Metric title="Completed" value={String(dashboardMetrics.completedTasks)} detail={`${dashboardMetrics.overdueTasks} overdue open`} icon={CheckCircle2} tone="blue" onClick={() => setActiveView("Tasks")} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Task Health</h2>
            <p className="mt-1 text-xs text-muted-foreground">Backend task counts that need attention now.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TaskHealthPill label="Due this week" value={dashboardMetrics.dueThisWeek} icon={CalendarDays} tone="amber" onClick={() => setActiveView("Tasks")} />
            <TaskHealthPill label="Overdue" value={dashboardMetrics.overdueTasks} icon={Clock3} tone="red" onClick={() => setActiveView("Tasks")} />
            <TaskHealthPill label="Pending" value={dashboardMetrics.pendingTasks} icon={Pause} tone="amber" onClick={() => setActiveView("Tasks")} />
            <TaskHealthPill label="In progress" value={dashboardMetrics.inProgressTasks} icon={Play} tone="blue" onClick={() => setActiveView("Tasks")} />
          </div>
        </section>

        <section className="space-y-6">
          {widgets.tasks && (
            <Card>
              <CardHeader>
                <CardTitle>What To Work On</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setActiveView("Tasks")}>Open tasks</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {todayTasks.length === 0 && <EmptyState label="No Dashboard task data available." />}
                {todayTasks.map((task) => (
                  <TaskRow key={task.id} task={task} store={store} compact onOpen={() => setSelectedTaskId(task.id)} onTaskStatusChange={onTaskStatusChange} />
                ))}
              </CardContent>
            </Card>
          )}
          {widgets.weekly && (
            <Card>
              <CardHeader>
                <CardTitle>Weekly Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <ChartKey label="Open" color="#64748B" />
                  <ChartKey label="Created" color="#4F46E5" />
                  <ChartKey label="Due" color="#F59E0B" />
                  <ChartKey label="Overdue" color="#EF4444" />
                  <ChartKey label="Completed" color="#2563EB" />
                  <ChartKey label="Focus" color="#10B981" />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: -26, right: 8, top: 8, bottom: 0 }}>
                      <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} />
                      <YAxis axisLine={false} tickLine={false} fontSize={12} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="open" fill="#64748B" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="created" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="due" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="overdue" fill="#EF4444" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="completed" fill="#2563EB" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="focus" fill="#10B981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
          {widgets.kanban && <KanbanPreview store={store} />}
          {widgets.projects && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Pinned Projects</h2>
                <p className="mt-1 text-xs text-muted-foreground">Projects you marked as important, with task counts and progress.</p>
              </div>
              <ProjectCards store={store} />
            </section>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        {widgets.timer && <TimerCard store={store} onStart={onTimerStart} onToggle={onTimerToggle} onStop={onTimerStop} />}
        {widgets.agenda && <AgendaCard store={store} />}
        {widgets.ai && <AiCard store={store} onGenerateAiDraft={onGenerateAiDraft} />}
        {widgets.notes && <RecentNotesCard store={store} onOpenNote={onOpenNote} />}
        {widgets.files && <RecentFilesCard store={store} onOpenFile={onOpenFile} />}
      </aside>
	      <TaskDrawer task={selectedTask} store={store} onClose={() => setSelectedTaskId(null)} onTaskStatusChange={(taskId, status, previousStatus) => { void onTaskStatusChange?.(taskId, status, previousStatus); }} onTaskUpdate={updateDashboardTask} onFileCreate={onFileCreate} />
    </div>
  );
}

type ViewProps = {
  store: ReturnType<typeof useWorkspaceStore>;
  openCreate: (kind: CreateKind) => void;
};

function TasksView({
  store,
  openCreate,
	  onTaskStatusChange,
	  onTaskUpdate,
	  onPromoteTicket,
	  onFileCreate,
	  loading,
  error,
  initialTaskId,
  onInitialTaskHandled
}: ViewProps & {
	  onTaskStatusChange?: (taskId: string, status: TaskStatus, previousStatus?: TaskStatus) => Promise<void>;
	  onTaskUpdate?: (task: Task) => Promise<void>;
	  onPromoteTicket?: (task: Task) => Promise<void>;
	  onFileCreate?: (input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) => Promise<void>;
  loading?: boolean;
  error?: string;
  initialTaskId?: string | null;
  onInitialTaskHandled?: () => void;
}) {
  const [mode, setMode] = useState<"details" | "kanban" | "calendar" | "timeline">("details");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "ongoing" | "completed">("all");
  const selectedTask = store.state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const hasTasks = store.state.tasks.length > 0;
  const filteredTasks = store.state.tasks.filter((task) => {
    if (taskFilter === "completed") return task.status === "Done";
    if (taskFilter === "ongoing") return task.status !== "Done";
    return true;
  });

  useEffect(() => {
    if (!initialTaskId) return;
    setSelectedTaskId(initialTaskId);
    onInitialTaskHandled?.();
  }, [initialTaskId, onInitialTaskHandled]);

  function changeTaskStatus(taskId: string, status: TaskStatus) {
    const previousStatus = store.state.tasks.find((task) => task.id === taskId)?.status;
    store.setTaskStatus(taskId, status);
    onTaskStatusChange?.(taskId, status, previousStatus).catch((syncError: Error) => {
      if (previousStatus) store.setTaskStatus(taskId, previousStatus);
      setSyncMessage(syncError.message || "Could not save task status.");
      window.setTimeout(() => setSyncMessage(""), 2400);
    });
  }

  function updateTask(previousTask: Task, nextTask: Task) {
    store.upsertTask(nextTask);
    onTaskUpdate?.(nextTask).catch((syncError: Error) => {
      store.upsertTask(previousTask);
      setSyncMessage(syncError.message || "Could not save task changes.");
      window.setTimeout(() => setSyncMessage(""), 2400);
    });
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Tasks"
        description="The single place to capture, plan, execute, and record progress notes for work."
        icon={Workflow}
        action="New task"
        onAction={() => openCreate("task")}
        rightSlot={hasTasks ? (
          <div className="flex flex-wrap rounded-lg border border-border bg-background p-1">
            <button className={modeButtonClass(mode === "details")} onClick={() => setMode("details")}>Details</button>
            <button className={modeButtonClass(mode === "kanban")} onClick={() => setMode("kanban")}>Kanban</button>
            <button className={modeButtonClass(mode === "calendar")} onClick={() => setMode("calendar")}>Calendar</button>
            <button className={modeButtonClass(mode === "timeline")} onClick={() => setMode("timeline")}>Timeline</button>
          </div>
        ) : undefined}
      />
      {(loading || error || syncMessage) && (
        <div className={cn("rounded-xl border px-4 py-3 text-sm", error || syncMessage ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100" : "border-border bg-card text-muted-foreground")}>
          {error || syncMessage || "Loading tasks from the active workspace..."}
        </div>
      )}
      {!loading && !error && !hasTasks && <EmptyState label="No Tasks data available." />}
      {hasTasks && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant={taskFilter === "all" ? "primary" : "outline"} size="sm" onClick={() => setTaskFilter("all")}>All tasks</Button>
            <Button variant={taskFilter === "ongoing" ? "primary" : "outline"} size="sm" onClick={() => setTaskFilter("ongoing")}>Ongoing</Button>
            <Button variant={taskFilter === "completed" ? "primary" : "outline"} size="sm" onClick={() => setTaskFilter("completed")}>Completed</Button>
          </div>
      {mode === "details" && (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskDetailListItem key={task.id} task={task} store={store} onOpen={() => setSelectedTaskId(task.id)} />
          ))}
          {filteredTasks.length === 0 && <EmptyState label="No Tasks data available for the selected filter." />}
        </div>
      )}
      {mode === "kanban" && (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
          <div className="grid w-max grid-cols-[repeat(6,340px)] gap-4 pr-4">
          {taskStatuses.map((status) => (
            <Card
              key={status}
              data-testid={`kanban-column-${status}`}
              className={cn("min-h-[560px] bg-secondary/30 transition", draggingTaskId && "border-dashed ring-2 ring-primary/20")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/task-id") || draggingTaskId;
                if (taskId) changeTaskStatus(taskId, status);
                setDraggingTaskId(null);
              }}
            >
              <CardHeader>
                <CardTitle>{status}</CardTitle>
                <Badge>{filteredTasks.filter((task) => task.status === status).length}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-3">
                {filteredTasks.filter((task) => task.status === status).map((task) => (
                  <TaskKanbanCard
                    key={task.id}
                    task={task}
                    onOpen={() => setSelectedTaskId(task.id)}
                    onDragStart={() => setDraggingTaskId(task.id)}
                    onDragEnd={() => setDraggingTaskId(null)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      )}
      {mode === "calendar" && <TaskCalendarView tasks={filteredTasks} onOpen={setSelectedTaskId} />}
      {mode === "timeline" && <TaskTimelineView tasks={filteredTasks} onOpen={setSelectedTaskId} />}
        </>
      )}
	      <TaskDrawer task={selectedTask} store={store} onClose={() => setSelectedTaskId(null)} onTaskStatusChange={changeTaskStatus} onTaskUpdate={updateTask} onPromoteTicket={onPromoteTicket} onFileCreate={onFileCreate} />
    </div>
  );
}

function ProjectsView({
  store,
  openCreate,
  onProjectSave,
  onProjectArchive,
  onProjectUnarchive
}: ViewProps & {
  onProjectSave?: (project: Project) => Promise<void>;
  onProjectArchive?: (project: Project) => Promise<void>;
  onProjectUnarchive?: (project: Project) => Promise<void>;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedProject = store.state.projects.find((project) => project.id === selectedProjectId);

  if (selectedProject) {
    return <ProjectDetailView project={selectedProject} store={store} onBack={() => setSelectedProjectId(null)} onProjectSave={onProjectSave} onProjectArchive={onProjectArchive} onProjectUnarchive={onProjectUnarchive} />;
  }
  const activeProjects = store.state.projects.filter((project) => !project.archived);
  const archivedProjects = store.state.projects.filter((project) => project.archived);

  return (
    <div className="space-y-6">
      <ModuleHeader title="Projects" description="Track initiatives, progress, related tasks, notes, and delivery dates." icon={FolderKanban} action="New project" onAction={() => openCreate("project")} />
      <ProjectCards projects={activeProjects} store={store} expanded onOpen={setSelectedProjectId} onProjectSave={onProjectSave} onProjectArchive={onProjectArchive} />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Archived Projects</h2>
          <p className="mt-1 text-xs text-muted-foreground">Archived projects are hidden from active planning but can be reviewed or restored here.</p>
        </div>
        <ProjectCards projects={archivedProjects} store={store} expanded archived onOpen={setSelectedProjectId} onProjectSave={onProjectSave} onProjectUnarchive={onProjectUnarchive} />
      </section>
    </div>
  );
}

function ProjectDetailView({
  project,
  store,
  onBack,
  onProjectSave,
  onProjectArchive,
  onProjectUnarchive
}: {
  project: Project;
  store: ReturnType<typeof useWorkspaceStore>;
  onBack: () => void;
  onProjectSave?: (project: Project) => Promise<void>;
  onProjectArchive?: (project: Project) => Promise<void>;
  onProjectUnarchive?: (project: Project) => Promise<void>;
}) {
  const tasks = store.state.tasks.filter((task) => task.projectId === project.id);
  const notes = getProjectNotes(project, store.state);
  const fileAssets = store.state.files.filter((file) => file.linkedType === "Project" && file.linkedId === project.id || file.linkedType === "Task" && tasks.some((task) => task.id === file.linkedId));
  const files = uniqueStrings([...fileAssets.map((file) => file.name), ...tasks.flatMap((task) => task.attachments)]);
  const completedTasks = tasks.filter((task) => task.status === "Done").length;
  const ticketTasks = tasks.filter((task) => task.workType === "Ticket");
  const activity = getProjectActivity(project, tasks, notes, files);
  const derivedProgress = getProjectProgress(project, tasks);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDue, setMilestoneDue] = useState(todayInputDate());
  const selectedTask = store.state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedNote = store.state.notes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedFile = store.state.files.find((file) => file.id === selectedFileId) ?? null;

  function saveProject(nextProject: Project) {
    store.upsertProject(nextProject);
    void onProjectSave?.(nextProject);
  }

  function addMilestone() {
    if (!milestoneTitle.trim()) return;
    saveProject({
      ...project,
      milestones: [
        ...project.milestones,
        { id: `milestone-${Math.random().toString(36).slice(2, 9)}`, title: milestoneTitle.trim(), due: milestoneDue || "TBD", completed: false }
      ]
    });
    setMilestoneTitle("");
    setMilestoneDue(todayInputDate());
  }

  function updateMilestone(milestoneId: string, patch: Partial<Project["milestones"][number]>) {
    saveProject({ ...project, milestones: project.milestones.map((milestone) => (milestone.id === milestoneId ? { ...milestone, ...patch } : milestone)) });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>Back to projects</Button>
        <div className="flex flex-wrap gap-2">
          {!project.archived && <Button variant="outline" size="sm" onClick={() => saveProject({ ...project, pinned: !project.pinned })}>{project.pinned ? "Unpin" : "Pin"}</Button>}
          <Button variant="outline" size="sm" onClick={() => setEditingProject(project)}><Pencil className="h-4 w-4" />Edit</Button>
          {project.archived ? (
            <Button variant="outline" size="sm" onClick={() => { onBack(); void onProjectUnarchive?.(project); }}>Unarchive project</Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(true)}>Archive project</Button>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <ProjectCoverImage project={project} className="h-48" />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <ProjectIconTile icon={project.icon} className="h-16 w-16 border border-border bg-card text-primary shadow-soft" />
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">{project.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{project.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{project.due}</Badge>
            {project.archived && <Badge>Archived</Badge>}
            <Badge>{projectIconOptions.find((option) => option.value === project.icon)?.label ?? "Project"}</Badge>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric title="Progress" value={`${derivedProgress}%`} detail={tasks.length ? "calculated from linked tasks" : "no linked tasks yet"} icon={FolderKanban} tone="indigo" />
        <Metric title="Tasks" value={String(tasks.length)} detail={`${completedTasks} done`} icon={Workflow} tone="blue" />
        <Metric title="Tickets" value={String(ticketTasks.length)} detail="customer or office work" icon={Ticket} tone="amber" />
        <Metric title="Files" value={String(files.length)} detail="linked attachments" icon={FileText} tone="emerald" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Project Tasks</CardTitle>
            <Badge>{tasks.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks are linked to this project yet.</p>}
            {tasks.map((task) => (
              <button key={task.id} type="button" onClick={() => setSelectedTaskId(task.id)} className="w-full rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-secondary/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{task.status} - {task.priority} - due {task.due}</p>
                  </div>
                  <Badge>{task.workType}</Badge>
                </div>
                <Progress className="mt-3" value={task.progress} />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <Badge>{project.milestones.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
              <input value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} placeholder="Milestone title" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <input type="date" value={milestoneDue.includes("-") ? milestoneDue : todayInputDate()} onChange={(event) => setMilestoneDue(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <Button size="sm" onClick={addMilestone}>Add</Button>
            </div>
            {project.milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones have been defined yet.</p>}
            {project.milestones.map((milestone) => (
              <button key={milestone.id} type="button" onClick={() => updateMilestone(milestone.id, { completed: !milestone.completed })} className="flex w-full items-start gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-secondary/40">
                <span className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", milestone.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-border")}>
                  {milestone.completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0">
                  <input value={milestone.title} onClick={(event) => event.stopPropagation()} onChange={(event) => updateMilestone(milestone.id, { title: event.target.value })} className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm font-medium outline-none focus:border-border focus:bg-card" />
                  <input type="date" value={milestone.due.includes("-") ? milestone.due : ""} onClick={(event) => event.stopPropagation()} onChange={(event) => updateMilestone(milestone.id, { due: event.target.value || "TBD" })} className="mt-1 h-8 rounded-md border border-transparent bg-transparent px-2 text-xs text-muted-foreground outline-none focus:border-border focus:bg-card" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ProjectRelationCard title="Notes" empty="No notes linked yet." items={notes.map((note) => ({ id: note.id, title: note.title, meta: note.updatedAt }))} onOpen={setSelectedNoteId} />
        <ProjectRelationCard title="Files" empty="No files linked yet." items={fileAssets.map((file) => ({ id: file.id, title: file.name, meta: getFileLinkLabel(store, file) }))} onOpen={setSelectedFileId} />
        <ProjectRelationCard title="Activity" empty="No project activity yet." items={activity} />
      </section>
      <ProjectEditorDialog project={editingProject} open={Boolean(editingProject)} onClose={() => setEditingProject(null)} onSave={onProjectSave} />
      <TaskDrawer task={selectedTask} store={store} onClose={() => setSelectedTaskId(null)} onTaskUpdate={(previousTask, nextTask) => { store.upsertTask(nextTask); }} />
      <NoteEditorDialog note={selectedNote} open={Boolean(selectedNote)} store={store} onClose={() => setSelectedNoteId(null)} onSave={async (note) => { store.updateNote(note); }} />
      <FileDetailDrawer file={selectedFile} store={store} onClose={() => setSelectedFileId(null)} />
      {confirmArchive && (
        <ConfirmDialog
          title="Archive project and hide it?"
          description="Archiving hides this project from active project lists. It does not delete linked tasks, notes, files, or history."
          confirmLabel="Archive project"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            setConfirmArchive(false);
            onBack();
            void onProjectArchive?.(project);
          }}
        />
      )}
    </div>
  );
}

function ProjectRelationCard({ title, empty, items, onOpen }: { title: string; empty: string; items: Array<{ id: string; title: string; meta: string }>; onOpen?: (id: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge>{items.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {items.slice(0, 8).map((item) => (
          <button key={item.id} type="button" onClick={() => onOpen?.(item.id)} disabled={!onOpen} className="w-full rounded-xl border border-border bg-background p-3 text-left transition enabled:hover:border-primary/40 enabled:hover:bg-secondary/40 disabled:cursor-default">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.meta}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function ProjectIconTile({ icon, className, style }: { icon: string; className?: string; style?: CSSProperties }) {
  const Icon = projectIconOptions.find((option) => option.value === icon)?.icon ?? FolderKanban;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl", className)} style={style}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

function ProjectCoverImage({ project, className }: { project: Project; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(project.coverUrl) && !failed;

  return (
    <div className={cn("relative overflow-hidden bg-secondary", className)}>
      {showImage ? (
        <img
          src={project.coverUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: `${project.color}22` }}>
          <ProjectIconTile icon={project.icon} className="h-14 w-14 text-white" style={{ backgroundColor: project.color }} />
        </div>
      )}
    </div>
  );
}

function ProjectEditorDialog({ project, open, onClose, onSave }: { project: Project | null; open: boolean; onClose: () => void; onSave?: (project: Project) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [icon, setIcon] = useState("folder-kanban");
  const [coverUrl, setCoverUrl] = useState("");
  const [color, setColor] = useState("#4F46E5");
  const [progress, setProgress] = useState("0");
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    setName(project.name);
    setDescription(project.description);
    setDue(project.due);
    setIcon(project.icon);
    setCoverUrl(project.coverUrl);
    setColor(project.color.startsWith("bg-") ? "#4F46E5" : project.color);
    setProgress(String(project.progress));
    setPinned(project.pinned);
  }, [open, project]);

  if (!open || !project) return null;

  const nextProject: Project = {
    ...project,
    name: name.trim() || "Untitled project",
    description,
    due: due.trim() || "TBD",
    icon,
    coverUrl,
    color,
    progress: Math.max(0, Math.min(100, Number.parseInt(progress, 10) || 0)),
    pinned
  };

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-lg font-semibold">Edit project</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <LabeledField label="Name">
              <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Description">
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
            <div className="grid gap-3 sm:grid-cols-3">
              <LabeledField label="Due date">
                <input type="date" value={due.includes("-") ? due : ""} onChange={(event) => setDue(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </LabeledField>
              <LabeledField label="Progress">
                <input type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </LabeledField>
              <LabeledField label="Color">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background p-1" />
              </LabeledField>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm">
              <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
              Pinned project
            </label>
            <LabeledField label="Cover image URL">
              <input value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <div className="grid grid-cols-3 gap-2">
              {projectCoverPresets.map((preset) => (
                <button key={preset} type="button" aria-label="Use cover preset" onClick={() => setCoverUrl(preset)} className={cn("h-16 overflow-hidden rounded-lg border border-border transition hover:ring-2 hover:ring-primary/30", coverUrl === preset && "ring-2 ring-primary")}>
                  <img src={preset} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
          <aside className="space-y-4">
            <ProjectCoverImage project={nextProject} className="h-36 rounded-xl" />
            <LabeledField label="Icon">
              <div className="grid grid-cols-4 gap-2">
                {projectIconOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button key={option.value} type="button" aria-label={option.label} onClick={() => setIcon(option.value)} className={cn("flex h-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary", icon === option.value && "border-primary bg-primary/10 text-primary ring-2 ring-primary/20")}>
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </LabeledField>
          </aside>
        </div>
        <div className="shrink-0 border-t border-border p-4">
          <Button className="w-full" onClick={() => { void onSave?.(nextProject); onClose(); }}>Save project</Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onCancel)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onCancel}>
      <div onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function NotesView({
  store,
  onNoteCreate,
  onNoteSave,
  initialNoteId,
  onInitialNoteHandled
}: ViewProps & {
  onNoteCreate?: (input: CreateNoteInput) => Promise<void>;
  onNoteSave?: (note: Note) => Promise<void>;
  initialNoteId?: string | null;
  onInitialNoteHandled?: () => void;
}) {
  const [editingNoteId, setEditingNoteId] = useState<string | "new" | null>(null);
  const [mode, setMode] = useState<"cards" | "graph">("cards");
  const editingNote = editingNoteId && editingNoteId !== "new" ? store.state.notes.find((note) => note.id === editingNoteId) ?? null : null;
  const graph = useMemo(() => getNoteGraph(store.state.notes), [store.state.notes]);

  useEffect(() => {
    if (!initialNoteId) return;
    setMode("cards");
    setEditingNoteId(initialNoteId);
    onInitialNoteHandled?.();
  }, [initialNoteId, onInitialNoteHandled]);

  return (
    <div className="space-y-6">
      <ModuleHeader title="Notes" description="Capture markdown notes, meeting summaries, and connected thinking." icon={FileText} action="New note" onAction={() => setEditingNoteId("new")} />
      {store.state.notes.length === 0 ? (
        <EmptyState label="No Notes data available." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "cards" ? "primary" : "outline"} size="sm" onClick={() => setMode("cards")}><FileText className="h-4 w-4" />Cards</Button>
            <Button variant={mode === "graph" ? "primary" : "outline"} size="sm" onClick={() => setMode("graph")}><Network className="h-4 w-4" />Graph</Button>
          </div>
          {mode === "cards" ? (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {store.state.notes.map((note) => {
                const incoming = graph.edges.filter((edge) => edge.to === note.id).length;
                const outgoing = graph.edges.filter((edge) => edge.from === note.id).length;
                return (
                  <Card key={note.id} className="cursor-pointer transition hover:-translate-y-0.5 hover:shadow-soft" onClick={() => setEditingNoteId(note.id)}>
                    <CardHeader>
                      <CardTitle>{note.title}</CardTitle>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            const nextNote = { ...note, pinned: !note.pinned };
                            if (onNoteSave) void onNoteSave(nextNote);
                            else store.toggleNotePinned(note.id);
                          }}
                        >
                          {note.pinned ? "Pinned" : "Pin"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); setEditingNoteId(note.id); }}><Pencil className="h-4 w-4" />Edit</Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <RichNotePreview content={note.content} compact />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {note.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                        <Badge>{incoming} backlinks</Badge>
                        <Badge>{outgoing} outgoing</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <NoteBacklinksGraph graph={graph} onOpenNote={setEditingNoteId} />
          )}
        </>
      )}
      <NoteEditorDialog note={editingNote} open={Boolean(editingNoteId)} store={store} onClose={() => setEditingNoteId(null)} onCreate={onNoteCreate} onSave={onNoteSave} />
    </div>
  );
}

type NoteGraphNode = {
  id: string;
  title: string;
  tags: string[];
  pinned: boolean;
};

type NoteGraphEdge = {
  id: string;
  from: string;
  to: string;
  type: "wikilink" | "tag";
};

type NoteGraph = {
  nodes: NoteGraphNode[];
  edges: NoteGraphEdge[];
};

function NoteBacklinksGraph({ graph, onOpenNote }: { graph: NoteGraph; onOpenNote: (noteId: string) => void }) {
  const [selectedId, setSelectedId] = useState(graph.nodes[0]?.id ?? "");
  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const positions = getGraphPositions(graph.nodes);

  useEffect(() => {
    if (!selectedId && graph.nodes[0]) setSelectedId(graph.nodes[0].id);
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) setSelectedId(graph.nodes[0]?.id ?? "");
  }, [graph.nodes, selectedId]);

  if (graph.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">No notes are available yet.</CardContent>
      </Card>
    );
  }

  const incoming = selectedNode ? graph.edges.filter((edge) => edge.to === selectedNode.id) : [];
  const outgoing = selectedNode ? graph.edges.filter((edge) => edge.from === selectedNode.id) : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
      <Card>
        <CardHeader>
          <CardTitle>Backlinks Graph</CardTitle>
          <Badge>{graph.edges.length} links</Badge>
        </CardHeader>
        <CardContent>
          <div className="relative h-[420px] overflow-hidden rounded-xl border border-border bg-secondary/20">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {graph.edges.map((edge) => {
                const from = positions[edge.from];
                const to = positions[edge.to];
                if (!from || !to) return null;
                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={edge.type === "wikilink" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                    strokeOpacity={edge.type === "wikilink" ? 0.5 : 0.25}
                    strokeWidth={edge.type === "wikilink" ? 0.55 : 0.35}
                  />
                );
              })}
            </svg>
            {graph.nodes.map((node) => {
              const position = positions[node.id];
              const isSelected = selectedNode?.id === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  onDoubleClick={() => onOpenNote(node.id)}
                  className={cn(
                    "absolute flex min-h-14 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-start justify-center rounded-xl border bg-card px-3 text-left shadow-soft transition hover:-translate-y-[54%] hover:border-primary/60",
                    isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"
                  )}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                >
                  <span className="line-clamp-1 text-sm font-medium">{node.title}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{node.pinned ? "Pinned" : node.tags.slice(0, 2).join(", ") || "Note"}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{selectedNode?.title ?? "Note"}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => selectedNode && onOpenNote(selectedNode.id)}><Pencil className="h-4 w-4" />Edit</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <GraphLinkList title="Backlinks" edges={incoming} graph={graph} direction="from" />
          <GraphLinkList title="Outgoing" edges={outgoing} graph={graph} direction="to" />
          <div className="rounded-xl border border-border bg-secondary/20 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Tags</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(selectedNode?.tags.length ? selectedNode.tags : ["untagged"]).map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GraphLinkList({ title, edges, graph, direction }: { title: string; edges: NoteGraphEdge[]; graph: NoteGraph; direction: "from" | "to" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <Badge>{edges.length}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {edges.length === 0 && <p className="text-sm text-muted-foreground">No links yet.</p>}
        {edges.map((edge) => {
          const node = graph.nodes.find((item) => item.id === edge[direction]);
          if (!node) return null;
          return (
            <div key={edge.id} className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="truncate text-sm font-medium">{node.title}</p>
              <p className="text-xs text-muted-foreground">{edge.type === "wikilink" ? "Wiki link" : "Shared tag"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NoteEditorDialog({
  note,
  open,
  store,
  onClose,
  onCreate,
  onSave
}: {
  note: Note | null;
  open: boolean;
  store: ReturnType<typeof useWorkspaceStore>;
  onClose: () => void;
  onCreate?: (input: CreateNoteInput) => Promise<void>;
  onSave?: (note: Note) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [projectId, setProjectId] = useState("");
  const [pinned, setPinned] = useState(false);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "# Untitled note\n\nStart writing...");
    setTags(note?.tags.join(", ") ?? "");
    setProjectId(note?.projectId ?? "");
    setPinned(note?.pinned ?? false);
    setMode("write");
    setError("");
  }, [note, open]);

  if (!open) return null;

  function insertMarkup(prefix: string, suffix = "", placeholder = "text") {
    const textarea = document.getElementById("rich-note-editor") as HTMLTextAreaElement | null;
    if (!textarea) {
      setContent((value) => `${value}${prefix}${placeholder}${suffix}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`;
    setContent(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  async function saveNote() {
    const nextNote = {
      id: note?.id ?? `note-${Math.random().toString(36).slice(2, 9)}`,
      title: title.trim() || "Untitled note",
      content,
      tags: splitLinesOrCommas(tags),
      projectId: projectId || undefined,
      pinned,
      updatedAt: "Just now",
      versions: note?.versions ?? []
    };
    try {
      if (note) {
        if (!onSave) throw new Error("Saving notes requires a backend workspace.");
        await onSave(nextNote);
      } else if (onCreate) {
        await onCreate(nextNote);
      } else {
        throw new Error("Creating notes requires a backend workspace.");
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save note.");
    }
  }

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" className="min-w-0 bg-transparent text-lg font-semibold outline-none" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={mode === "write" ? "primary" : "outline"} size="sm" onClick={() => setMode("write")}><Pencil className="h-4 w-4" />Write</Button>
            <Button type="button" variant={mode === "preview" ? "primary" : "outline"} size="sm" onClick={() => setMode("preview")}><Eye className="h-4 w-4" />Preview</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void saveNote()}><Save className="h-4 w-4" />Save</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4 overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
            <LabeledField label="Project">
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">No project</option>
                {store.state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Tags">
              <textarea value={tags} onChange={(event) => setTags(event.target.value)} placeholder="strategy, meeting, rca" className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm">
              <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
              Pin note
            </label>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs leading-5 text-muted-foreground">
              Supports headings, bold, italic, lists, checklists, quotes, code blocks, links, tables, and live preview.
            </div>
            {note && (
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Version history</p>
                  <Badge>{note.versions.length}</Badge>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                  {note.versions.length === 0 && <p className="text-xs text-muted-foreground">No previous versions yet.</p>}
                  {note.versions.map((version) => (
                    <div key={version.id} className="rounded-lg border border-border bg-secondary/20 p-2">
                      <p className="truncate text-xs font-medium">{version.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{version.savedAt}</p>
	                      <Button
	                        type="button"
	                        variant="outline"
	                        size="sm"
	                        className="mt-2 w-full"
	                        onClick={() => {
	                          const restoredNote = {
	                            ...note,
	                            title: version.title,
	                            content: version.content,
	                            tags: version.tags,
	                            projectId: version.projectId,
	                            pinned: version.pinned,
	                            updatedAt: "Just now"
	                          };
	                          if (onSave) void onSave(restoredNote).then(onClose).catch((restoreError) => setError(restoreError instanceof Error ? restoreError.message : "Could not restore note version."));
	                          else {
	                            store.restoreNoteVersion(note.id, version.id);
	                            onClose();
	                          }
	                        }}
	                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
          <section className="flex min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap gap-2 border-b border-border p-3">
              <EditorTool label="Heading" icon={Heading2} onClick={() => insertMarkup("\n## ", "", "Heading")} />
              <EditorTool label="Bold" icon={Bold} onClick={() => insertMarkup("**", "**", "bold text")} />
              <EditorTool label="Italic" icon={Italic} onClick={() => insertMarkup("_", "_", "italic text")} />
              <EditorTool label="List" icon={List} onClick={() => insertMarkup("\n- ", "", "List item")} />
              <EditorTool label="Checklist" icon={ListChecks} onClick={() => insertMarkup("\n- [ ] ", "", "Checklist item")} />
              <EditorTool label="Quote" icon={Quote} onClick={() => insertMarkup("\n> ", "", "Quote")} />
              <EditorTool label="Code" icon={Code2} onClick={() => insertMarkup("\n```sql\n", "\n```", "select * from tasks;")} />
              <EditorTool label="Wiki" icon={Network} onClick={() => insertMarkup("[[", "]]", store.state.notes[0]?.title ?? "Note title")} />
              <EditorTool label="Link" icon={Link} onClick={() => insertMarkup("[", "](https://)", "Link text")} />
              <EditorTool label="Table" icon={Table2} onClick={() => insertMarkup("\n| Column | Value |\n| --- | --- |\n| ", " | |\n", "Name")} />
            </div>
            {mode === "write" ? (
              <textarea
                id="rich-note-editor"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[480px] flex-1 resize-none overflow-y-auto bg-background p-5 font-mono text-sm leading-7 outline-none"
                spellCheck
              />
            ) : (
              <div className="min-h-[480px] flex-1 overflow-y-auto bg-background p-5">
                <RichNotePreview content={content} />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function EditorTool({ label, icon: Icon, onClick }: { label: string; icon: typeof Workflow; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function RichNotePreview({ content, compact = false }: { content: string; compact?: boolean }) {
  const blocks = parseRichNoteBlocks(content);
  return (
    <div className={cn("space-y-3 text-sm leading-7", compact && "line-clamp-6 text-muted-foreground")}>
      {blocks.map((block, index) => {
        if (block.type === "heading") return <h3 key={index} className="text-base font-semibold text-foreground">{renderInlineMarkdown(block.content)}</h3>;
        if (block.type === "quote") return <blockquote key={index} className="border-l-4 border-primary/40 pl-3 text-muted-foreground">{renderInlineMarkdown(block.content)}</blockquote>;
        if (block.type === "code") return <pre key={index} className="overflow-auto rounded-xl border border-border bg-slate-950 p-3 text-xs leading-6 text-slate-100"><code>{block.content}</code></pre>;
        if (block.type === "check") return <div key={index} className="flex items-start gap-2"><input type="checkbox" checked={block.checked} readOnly className="mt-1" /><span>{renderInlineMarkdown(block.content)}</span></div>;
        if (block.type === "list") return <div key={index} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{renderInlineMarkdown(block.content)}</span></div>;
        if (block.type === "table") return <RichNoteTable key={index} rows={block.rows} />;
        return <p key={index}>{renderInlineMarkdown(block.content)}</p>;
      })}
    </div>
  );
}

type RichNoteBlock =
  | { type: "heading" | "quote" | "list" | "paragraph"; content: string }
  | { type: "check"; content: string; checked: boolean }
  | { type: "code"; content: string }
  | { type: "table"; rows: string[][] };

function parseRichNoteBlocks(content: string): RichNoteBlock[] {
  const blocks: RichNoteBlock[] = [];
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", content: code.join("\n") });
      continue;
    }
    if (line.startsWith("|") && lines[index + 1]?.includes("---")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        if (!lines[index].includes("---")) rows.push(lines[index].split("|").map((cell) => cell.trim()).filter(Boolean));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", rows });
      continue;
    }
    if (/^#{1,3}\s/.test(line)) blocks.push({ type: "heading", content: line.replace(/^#{1,3}\s/, "") });
    else if (/^>\s/.test(line)) blocks.push({ type: "quote", content: line.replace(/^>\s/, "") });
    else if (/^-\s\[[ xX]\]\s/.test(line)) blocks.push({ type: "check", checked: /^-\s\[[xX]\]/.test(line), content: line.replace(/^-\s\[[ xX]\]\s/, "") });
    else if (/^[-*]\s/.test(line)) blocks.push({ type: "list", content: line.replace(/^[-*]\s/, "") });
    else blocks.push({ type: "paragraph", content: line });
  }
  return blocks.length ? blocks : [{ type: "paragraph", content: "Nothing written yet." }];
}

function RichNoteTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary">
          <tr>{head.map((cell) => <th key={cell} className="px-3 py-2 font-semibold">{renderInlineMarkdown(cell)}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, index) => (
            <tr key={index} className="border-t border-border">
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-3 py-2">{renderInlineMarkdown(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInlineMarkdown(value: string): ReactNode[] {
  const tokens = value.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("[[") && token.endsWith("]]")) return <span key={index} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">{token.slice(2, -2)}</span>;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("_") && token.endsWith("_")) return <em key={index}>{token.slice(1, -1)}</em>;
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} className="text-primary underline underline-offset-4" target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={index}>{token}</span>;
  });
}

function getNoteGraph(notes: Note[]): NoteGraph {
  const nodes = notes.map((note) => ({ id: note.id, title: note.title, tags: note.tags, pinned: note.pinned }));
  const noteByTitle = new Map(notes.map((note) => [normalizeSearchText(note.title), note]));
  const edges = new Map<string, NoteGraphEdge>();

  notes.forEach((note) => {
    extractWikiLinks(note.content).forEach((title) => {
      const target = noteByTitle.get(normalizeSearchText(title));
      if (!target || target.id === note.id) return;
      const id = `${note.id}-${target.id}-wikilink`;
      edges.set(id, { id, from: note.id, to: target.id, type: "wikilink" });
    });
  });

  notes.forEach((source) => {
    notes.forEach((target) => {
      if (source.id >= target.id) return;
      const sharedTags = source.tags.filter((tag) => target.tags.includes(tag) && isMeaningfulRelationTag(normalizeSearchText(tag)));
      if (sharedTags.length === 0) return;
      const forwardId = `${source.id}-${target.id}-tag`;
      const backwardId = `${target.id}-${source.id}-tag`;
      if (!edges.has(`${source.id}-${target.id}-wikilink`)) edges.set(forwardId, { id: forwardId, from: source.id, to: target.id, type: "tag" });
      if (!edges.has(`${target.id}-${source.id}-wikilink`)) edges.set(backwardId, { id: backwardId, from: target.id, to: source.id, type: "tag" });
    });
  });

  return { nodes, edges: Array.from(edges.values()) };
}

function extractWikiLinks(content: string) {
  return Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g)).map((match) => match[1].trim()).filter(Boolean);
}

function getGraphPositions(nodes: NoteGraphNode[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  const centerX = 50;
  const centerY = 50;
  const radius = nodes.length <= 3 ? 26 : 34;
  nodes.forEach((node, index) => {
    if (nodes.length === 1) {
      positions[node.id] = { x: centerX, y: centerY };
      return;
    }
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    positions[node.id] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });
  return positions;
}

function TicketsView({
  store,
  openCreate,
	  onTaskStatusChange,
	  onTaskUpdate,
	  onPromoteTicket,
	  onFileCreate
	}: ViewProps & {
	  onTaskStatusChange?: (taskId: string, status: TaskStatus, previousStatus?: TaskStatus) => Promise<void>;
	  onTaskUpdate?: (task: Task) => Promise<void>;
	  onPromoteTicket?: (task: Task) => Promise<void>;
	  onFileCreate?: (input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) => Promise<void>;
}) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const ticketTasks = store.state.tasks.filter((task) => task.workType === "Ticket");
  const selectedTask = ticketTasks.find((task) => task.id === selectedTaskId) ?? null;

  function changeTaskStatus(taskId: string, status: TaskStatus) {
    const previousStatus = store.state.tasks.find((task) => task.id === taskId)?.status;
    store.setTaskStatus(taskId, status);
    onTaskStatusChange?.(taskId, status, previousStatus).catch((syncError: Error) => {
      if (previousStatus) store.setTaskStatus(taskId, previousStatus);
      setSyncMessage(syncError.message || "Could not save ticket status.");
      window.setTimeout(() => setSyncMessage(""), 2400);
    });
  }

  function updateTask(previousTask: Task, nextTask: Task) {
    store.upsertTask(nextTask);
    onTaskUpdate?.(nextTask).catch((syncError: Error) => {
      store.upsertTask(previousTask);
      setSyncMessage(syncError.message || "Could not save ticket changes.");
      window.setTimeout(() => setSyncMessage(""), 2400);
    });
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title="Tickets" description="Ticket work is now handled as task-backed investigation work with customer, severity, RCA, and closure fields." icon={Ticket} action="New ticket" onAction={() => openCreate("ticket")} />
      {syncMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {syncMessage}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {ticketTasks.map((ticket) => (
	          <Card key={ticket.id} className="cursor-pointer transition hover:-translate-y-0.5 hover:shadow-soft" onClick={() => setSelectedTaskId(ticket.id)}>
            <CardHeader>
              <div>
                <CardTitle>{ticket.ticketNumber || "Ticket"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{ticket.title}</p>
              </div>
              <Badge className={severityClass(ticket.severity ?? "Medium")}>{ticket.severity ?? "Medium"}</Badge>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge>{ticket.customer || "Internal"}</Badge>
                <Badge>{ticket.priority}</Badge>
                <Badge>{ticket.status}</Badge>
              </div>
              <p className="mb-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{ticket.description}</p>
              <div className="flex flex-wrap gap-2">
                {(["Todo", "In Progress", "Pending", "Review", "Done"] as TaskStatus[]).map((status) => (
	                  <Button key={status} variant={ticket.status === status ? "primary" : "outline"} size="sm" onClick={(event) => { event.stopPropagation(); changeTaskStatus(ticket.id, status); }}>
	                    {status}
	                  </Button>
	                ))}
	              </div>
            </CardContent>
          </Card>
        ))}
        {ticketTasks.length === 0 && (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">No ticket tasks yet. Create a ticket to capture an investigation as a task-backed workflow.</CardContent>
          </Card>
        )}
      </div>
	      <TaskDrawer task={selectedTask} store={store} onClose={() => setSelectedTaskId(null)} onTaskStatusChange={changeTaskStatus} onTaskUpdate={updateTask} onPromoteTicket={onPromoteTicket} onFileCreate={onFileCreate} />
    </div>
  );
}

function KnowledgeView({
  store,
  openCreate,
  onArticleSave,
  onTaskStatusChange,
  onTaskUpdate,
  onPromoteTicket,
  onFileCreate,
  onNoteSave,
  onSqlSave,
  onFileUpdate,
  onFileDelete,
  onGenerateAiDraft,
  initialArticleId,
  onInitialArticleHandled
}: ViewProps & {
  onArticleSave?: (article: KnowledgeArticle) => Promise<void>;
  onTaskStatusChange?: (taskId: string, status: TaskStatus, previousStatus?: TaskStatus) => void;
  onTaskUpdate?: (task: Task) => Promise<void>;
  onPromoteTicket?: (task: Task) => Promise<void>;
  onFileCreate?: (input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) => Promise<void>;
  onNoteSave?: (note: Note) => Promise<void>;
  onSqlSave?: (snippet: SqlSnippet) => Promise<void>;
  onFileUpdate?: (file: FileAsset, input: { name?: string; linkedType?: FileAsset["linkedType"]; linkedId?: string }) => Promise<void>;
  onFileDelete?: (file: FileAsset) => Promise<void>;
  onGenerateAiDraft?: (prompt: string) => Promise<string>;
  initialArticleId?: string | null;
  onInitialArticleHandled?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [analyzingArticleId, setAnalyzingArticleId] = useState<string | null>(null);
  const [analysisArticleId, setAnalysisArticleId] = useState<string | null>(null);
  const [analysisDraft, setAnalysisDraft] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiErrorArticleId, setAiErrorArticleId] = useState<string | null>(null);
  const editingArticle = store.state.articles.find((article) => article.id === editingArticleId) ?? null;
  const selectedTask = store.state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const editingNote = store.state.notes.find((note) => note.id === editingNoteId) ?? null;
  const editingSnippet = store.state.sqlSnippets.find((snippet) => snippet.id === editingSnippetId) ?? null;
  const selectedFile = store.state.files.find((file) => file.id === selectedFileId) ?? null;
  const articles = store.state.articles
    .map((article) => ({ article, relations: getArticleRelations(article, store.state) }))
    .filter(({ article, relations }) => articleMatchesKnowledgeQuery(article, relations, query));

  useEffect(() => {
    if (!initialArticleId) return;
    setEditingArticleId(initialArticleId);
    onInitialArticleHandled?.();
  }, [initialArticleId, onInitialArticleHandled]);

  async function askKnowledgeAi(article: KnowledgeArticle, relations: ArticleRelations) {
    if (!onGenerateAiDraft) return;
    setAnalyzingArticleId(article.id);
    setAnalysisArticleId(article.id);
    setAnalysisDraft("");
    setAiError("");
    setAiErrorArticleId(null);
    try {
      const draft = await onGenerateAiDraft(buildKnowledgeAiPrompt(article, relations));
      setAnalysisDraft(draft);
      setAnalysisArticleId(article.id);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI knowledge analysis failed.");
      setAiErrorArticleId(article.id);
    } finally {
      setAnalyzingArticleId(null);
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title="Knowledge Base" description="Turn solved work into reusable documentation with problem, root cause, and resolution." icon={BookOpen} action="New article" onAction={() => openCreate("article")} />
      <Card>
        <CardContent className="p-4">
          <LabeledField label="Search articles and auto-linked context">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask naturally: ticket issue, customer context, SQL purpose, file, note, date, or what happened" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </LabeledField>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {articles.map(({ article, relations }) => {
          return (
            <Card key={article.id}>
              <CardHeader>
                <div>
                  <CardTitle>{article.title}</CardTitle>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {article.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={Boolean(analyzingArticleId) || !onGenerateAiDraft} onClick={() => void askKnowledgeAi(article, relations)}><Sparkles className="h-4 w-4" />{analyzingArticleId === article.id ? "Analyzing..." : "Analyze"}</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingArticleId(article.id)}><Pencil className="h-4 w-4" />Edit</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6">
                {aiError && aiErrorArticleId === article.id && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">{aiError}</p>}
                {analyzingArticleId === article.id && (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="font-medium">Generating article analysis...</span>
                  </div>
                )}
                {analysisArticleId === article.id && analysisDraft && <AiDraftView content={analysisDraft} />}
                <DocBlock label="Problem" value={article.problem} />
                <DocBlock label="Root cause" value={article.rootCause} />
                <DocBlock label="Resolution" value={article.resolution} />
                <ArticleRelationsPanel
                  relations={relations}
                  onOpenTask={setSelectedTaskId}
                  onOpenNote={setEditingNoteId}
                  onOpenSql={setEditingSnippetId}
                  onOpenFile={setSelectedFileId}
                  onEditArticle={() => setEditingArticleId(article.id)}
                />
              </CardContent>
            </Card>
          );
        })}
        {articles.length === 0 && (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">No knowledge articles match this search yet.</CardContent>
          </Card>
        )}
      </div>
      <ArticleEditorDialog article={editingArticle} open={Boolean(editingArticle)} store={store} onClose={() => setEditingArticleId(null)} onSave={async (article) => {
        if (onArticleSave) await onArticleSave(article);
        else store.upsertArticle(article);
      }} />
      <TaskDrawer task={selectedTask} store={store} onClose={() => setSelectedTaskId(null)} onTaskStatusChange={onTaskStatusChange} onTaskUpdate={onTaskUpdate ? (previousTask, nextTask) => { store.upsertTask(nextTask); void onTaskUpdate(nextTask); } : undefined} onPromoteTicket={onPromoteTicket} onFileCreate={onFileCreate} />
      <NoteEditorDialog note={editingNote} open={Boolean(editingNote)} store={store} onClose={() => setEditingNoteId(null)} onSave={async (note) => { if (onNoteSave) await onNoteSave(note); else store.updateNote(note); }} />
      <SqlEditorDialog snippet={editingSnippet} open={Boolean(editingSnippet)} store={store} notify={() => {}} onClose={() => setEditingSnippetId(null)} onSave={onSqlSave} />
      <FileDetailDrawer file={selectedFile} store={store} onClose={() => setSelectedFileId(null)} onUpdate={onFileUpdate} onDelete={onFileDelete} />
    </div>
  );
}

function WorkspaceKnowledgeAnswer({
  answer,
  question,
  store,
  onOpenTask,
  onOpenArticle,
  onOpenNote,
  onOpenSql,
  onOpenFile,
  onOpenTimeTracker
}: {
  answer: WorkspaceAiAnswer;
  question: string;
  store: ReturnType<typeof useWorkspaceStore>;
  onOpenTask: (taskId: string) => void;
  onOpenArticle: (articleId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenSql: (snippetId: string) => void;
  onOpenFile: (fileId: string) => void;
  onOpenTimeTracker?: () => void;
}) {
  const directAnswer = getWorkspaceKnowledgeDirectAnswer(answer, question);
  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn(answer.sufficientContext ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100")}>
            {answer.sufficientContext ? "Grounded answer" : "Needs more context"}
          </Badge>
          {answer.providerLabel && <Badge>{answer.providerLabel}{answer.model ? ` / ${answer.model}` : ""}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{answer.sources.length} source{answer.sources.length === 1 ? "" : "s"} checked</p>
      </div>
      {directAnswer && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            <Sparkles className="h-4 w-4" />
            Direct answer
          </div>
          <h3 className="mt-3 text-base font-semibold">{directAnswer.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{directAnswer.body}</p>
          {directAnswer.meta && <p className="mt-3 text-xs text-muted-foreground">{directAnswer.meta}</p>}
        </div>
      )}
      {answer.sources.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Best matches</p>
            <p className="mt-1 text-xs text-muted-foreground">Open the card to inspect or update the source record.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {answer.sources.map((source) => (
              <WorkspaceKnowledgeSourceCard
                key={source.sourceId}
                source={source}
                store={store}
                onOpenTask={onOpenTask}
                onOpenArticle={onOpenArticle}
                onOpenNote={onOpenNote}
                onOpenSql={onOpenSql}
                onOpenFile={onOpenFile}
                onOpenTimeTracker={onOpenTimeTracker}
              />
            ))}
          </div>
        </div>
      )}
      {answer.sources.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">{answer.content}</p>}
      {answer.sources.length > 0 && (
        <details className="overflow-hidden rounded-xl border border-border bg-secondary/30 text-sm">
          <summary className="cursor-pointer px-4 py-3 font-medium text-muted-foreground transition hover:bg-secondary">
            <span className="inline-flex items-center gap-2"><BrainCircuit className="h-4 w-4" /> Reasoning and evidence</span>
          </summary>
          <div className="border-t border-border p-3">
            <AiDraftView content={answer.content} />
          </div>
        </details>
      )}
    </div>
  );
}

function GlobalWorkspaceAssistant({
  open,
  question,
  setQuestion,
  answeredQuestion,
  answer,
  loading,
  error,
  store,
  onClose,
  onAsk,
  onOpenTask,
  onOpenArticle,
  onOpenNote,
  onOpenSql,
  onOpenFile,
  onOpenTimeTracker
}: {
  open: boolean;
  question: string;
  setQuestion: (value: string) => void;
  answeredQuestion: string;
  answer: WorkspaceAiAnswer | null;
  loading: boolean;
  error: string;
  store: ReturnType<typeof useWorkspaceStore>;
  onClose: () => void;
  onAsk: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenArticle: (articleId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenSql: (snippetId: string) => void;
  onOpenFile: (fileId: string) => void;
  onOpenTimeTracker: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm" onMouseDown={onClose}>
      <motion.aside
        initial={{ x: 420, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 420, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="flex h-full w-full max-w-3xl flex-col border-l border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
              <Sparkles className="h-4 w-4" />
              Workspace AI
            </div>
            <h2 className="mt-1 text-lg font-semibold">Ask across this workspace</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="shrink-0 border-b border-border p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              autoFocus
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onAsk();
              }}
              placeholder="Ask naturally: open items, this month's work, ticket context, SQL, files, notes..."
              className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button className="lg:w-32" disabled={!question.trim() || loading} onClick={onAsk}>
              <Sparkles className="h-4 w-4" />
              {loading ? "Asking..." : "Ask"}
            </Button>
          </div>
          {error && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!answer && !loading && !error && (
            <div className="rounded-xl border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
              Ask one question and the assistant will search saved tasks, ticket history, articles, notes, SQL snippets, file metadata, and timers before answering.
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="font-medium">Retrieving workspace evidence...</span>
            </div>
          )}
          {answer && (
            <WorkspaceKnowledgeAnswer
              answer={answer}
              question={answeredQuestion}
              store={store}
              onOpenTask={onOpenTask}
              onOpenArticle={onOpenArticle}
              onOpenNote={onOpenNote}
              onOpenSql={onOpenSql}
              onOpenFile={onOpenFile}
              onOpenTimeTracker={onOpenTimeTracker}
            />
          )}
        </div>
      </motion.aside>
    </div>
  );
}

function WorkspaceKnowledgeSourceCard({
  source,
  store,
  onOpenTask,
  onOpenArticle,
  onOpenNote,
  onOpenSql,
  onOpenFile,
  onOpenTimeTracker
}: {
  source: WorkspaceAiAnswer["sources"][number];
  store: ReturnType<typeof useWorkspaceStore>;
  onOpenTask: (taskId: string) => void;
  onOpenArticle: (articleId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenSql: (snippetId: string) => void;
  onOpenFile: (fileId: string) => void;
  onOpenTimeTracker?: () => void;
}) {
  const action = getWorkspaceKnowledgeSourceAction(source, store.state, { onOpenTask, onOpenArticle, onOpenNote, onOpenSql, onOpenFile, onOpenTimeTracker });
  const factChips = getWorkspaceKnowledgeFactChips(source);

  return (
    <button
      type="button"
      disabled={!action}
      onClick={action?.onOpen}
      className="group min-h-44 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-primary/40 enabled:hover:shadow-soft disabled:cursor-default"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{source.sourceId}</Badge>
            <Badge>{source.type}</Badge>
          </div>
          <h3 className="mt-3 break-words text-sm font-semibold leading-5">{source.title}</h3>
        </div>
        <Eye className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition", action && "group-hover:text-primary")} />
      </div>
      {factChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {factChips.map((chip) => (
            <span key={chip.label} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", chip.className)}>{chip.label}</span>
          ))}
        </div>
      )}
      {source.facts?.latestNote && <p className="mt-3 text-xs font-semibold uppercase text-primary">Latest update</p>}
      <p className={cn("line-clamp-3 text-xs leading-5 text-muted-foreground", source.facts?.latestNote ? "mt-1" : "mt-3")}>{getWorkspaceKnowledgeCardSummary(source)}</p>
      <p className={cn("mt-4 text-xs font-medium", action ? "text-primary" : "text-muted-foreground")}>{action?.label ?? "Record is not loaded in this view"}</p>
    </button>
  );
}

function getWorkspaceKnowledgeDirectAnswer(answer: WorkspaceAiAnswer, question: string) {
  if (!answer.sufficientContext || answer.sources.length === 0) return null;
  const normalizedQuestion = question.toLowerCase();
  const firstSource = answer.sources[0];
  const facts = firstSource.facts;
  const asksLatestUpdate = normalizedQuestion.includes("last update")
    || normalizedQuestion.includes("latest update")
    || normalizedQuestion.includes("last updated")
    || normalizedQuestion.includes("latest note")
    || normalizedQuestion.includes("recent note");
  const asksPriority = normalizedQuestion.includes("priority")
    || normalizedQuestion.includes("prioritize")
    || normalizedQuestion.includes("what should i work on")
    || normalizedQuestion.includes("next task");
  const asksTime = normalizedQuestion.includes("how much time")
    || normalizedQuestion.includes("time did i work")
    || normalizedQuestion.includes("time have i worked")
    || normalizedQuestion.includes("tracked time")
    || normalizedQuestion.includes("focus time")
    || normalizedQuestion.includes("time spent");
  const asksActivitySummary = !normalizedQuestion.includes("how much time")
    && (
      normalizedQuestion.includes("summarize")
      || normalizedQuestion.includes("summerize")
      || normalizedQuestion.includes("summary")
      || normalizedQuestion.includes("recap")
      || normalizedQuestion.includes("report")
      || normalizedQuestion.includes("what did i work")
      || normalizedQuestion.includes("what have i worked")
      || normalizedQuestion.includes("what i have worked")
      || normalizedQuestion.includes("worked on")
      || normalizedQuestion.includes("work done")
      || normalizedQuestion.includes("activity")
    );

  if (asksLatestUpdate && facts) {
    const updateText = facts.latestNote || facts.notes;
    return {
      title: `Last update on ${firstSource.title}`,
      body: updateText || "This record has an update timestamp, but no progress note text is recorded yet.",
      meta: [
        facts.latestNoteAt ? `Note recorded ${formatDateLabel(facts.latestNoteAt)}` : "",
        facts.updatedAt ? `Record updated ${formatDateLabel(facts.updatedAt)}` : "",
        facts.status ? `Status ${facts.status}` : ""
      ].filter(Boolean).join(" - ")
    };
  }

  if (asksActivitySummary) {
    const sections = parseAiSections(answer.content);
    const summary = sections.find((section) => ["activity summary", "work summary", "summary"].includes(cleanAiMarkdown(section.heading).toLowerCase())) ?? sections[0];
    const body = summary.lines
      .slice(0, 4)
      .map((line) => cleanAiMarkdown(line))
      .filter(Boolean)
      .join("\n");
    const timeSource = answer.sources.find((source) => source.type === "Time Entry" && source.id.startsWith("time-summary"));
    const touchedSources = answer.sources.filter((source) => !source.id.startsWith("time-summary")).length;
    return {
      title: `Work summary ${timeSource?.facts?.timeRangeLabel ?? ""}`.trim(),
      body: body || getWorkspaceKnowledgeCardSummary(firstSource),
      meta: `${formatCompactDuration(timeSource?.facts?.durationSec ?? 0)} tracked - ${touchedSources} supporting source${touchedSources === 1 ? "" : "s"}`
    };
  }

  if (asksTime) {
    const timeSource = answer.sources.find((source) => source.type === "Time Entry" && source.id.startsWith("time-summary")) ?? firstSource;
    const timeFacts = timeSource.facts;
    return {
      title: `Time worked ${timeFacts?.timeRangeLabel ?? ""}`.trim(),
      body: `You worked ${formatCompactDuration(timeFacts?.durationSec ?? 0)}${timeFacts?.timeRangeLabel ? ` ${timeFacts.timeRangeLabel}` : ""}.`,
      meta: `${timeFacts?.timeEntryCount ?? 0} time entr${timeFacts?.timeEntryCount === 1 ? "y" : "ies"} counted`
    };
  }

  if (asksPriority) {
    const top = answer.sources.slice(0, 3).map((source, index) => {
      const sourceFacts = source.facts;
      return `${index + 1}. ${source.title}${sourceFacts?.priority ? ` (${sourceFacts.priority})` : ""}${sourceFacts?.dueDate ? ` - due ${formatDateLabel(sourceFacts.dueDate)}` : ""}`;
    }).join("\n");
    return {
      title: "Priority queue",
      body: top,
      meta: `${answer.sources.length} ranked source${answer.sources.length === 1 ? "" : "s"}`
    };
  }

  const firstUsefulLine = cleanAiMarkdown(answer.content)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !["summary", "priority list", "top items", "next actions", "missing context", "latest update", "time worked", "time by task", "note"].includes(line.toLowerCase()));
  return {
    title: "Answer",
    body: firstUsefulLine || getWorkspaceKnowledgeCardSummary(firstSource),
    meta: `${answer.sources.length} grounded source${answer.sources.length === 1 ? "" : "s"}`
  };
}

type WorkspaceKnowledgeSourceHandlers = {
  onOpenTask: (taskId: string) => void;
  onOpenArticle: (articleId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenSql: (snippetId: string) => void;
  onOpenFile: (fileId: string) => void;
  onOpenTimeTracker?: () => void;
};

function getWorkspaceKnowledgeSourceAction(source: WorkspaceAiAnswer["sources"][number], state: WorkspaceState, handlers: WorkspaceKnowledgeSourceHandlers) {
  if (source.type === "Task" || source.type === "Ticket") {
    const task = state.tasks.find((item) => item.id === source.id)
      ?? state.tasks.find((item) => Boolean(source.facts?.ticketNumber && item.ticketNumber === source.facts.ticketNumber))
      ?? state.tasks.find((item) => item.title === source.title);
    if (!task) return null;
    return { label: source.type === "Ticket" || task.workType === "Ticket" ? "Open ticket task" : "Open task", onOpen: () => handlers.onOpenTask(task.id) };
  }
  if (source.type === "Knowledge Article" && state.articles.some((article) => article.id === source.id)) {
    return { label: "Open article", onOpen: () => handlers.onOpenArticle(source.id) };
  }
  if (source.type === "Note" && state.notes.some((note) => note.id === source.id)) {
    return { label: "Open note", onOpen: () => handlers.onOpenNote(source.id) };
  }
  if (source.type === "SQL Snippet" && state.sqlSnippets.some((snippet) => snippet.id === source.id)) {
    return { label: "Open SQL", onOpen: () => handlers.onOpenSql(source.id) };
  }
  if (source.type === "File" && state.files.some((file) => file.id === source.id)) {
    return { label: "Open file", onOpen: () => handlers.onOpenFile(source.id) };
  }
  if (source.type === "Time Entry") {
    const relatedTask = state.tasks.find((task) => task.id === source.facts?.taskId)
      ?? state.tasks.find((task) => source.facts?.taskTitle && task.title === source.facts.taskTitle);
    if (relatedTask) return { label: "Open related task", onOpen: () => handlers.onOpenTask(relatedTask.id) };
    if (handlers.onOpenTimeTracker) return { label: "Open time tracker", onOpen: handlers.onOpenTimeTracker };
    return { label: "Time summary", onOpen: () => {} };
  }
  return null;
}

function getWorkspaceKnowledgeFactChips(source: WorkspaceAiAnswer["sources"][number]) {
  const facts = source.facts;
  if (!facts) return [];
  const chips: Array<{ label: string; className: string }> = [];
  if (facts.activityReason) chips.push({ label: facts.activityReason, className: "border-primary/20 bg-primary/5 text-primary" });
  if (facts.status) chips.push({ label: facts.status, className: "border-border bg-background text-foreground" });
  if (facts.priority) chips.push({ label: facts.priority, className: priorityClass(facts.priority) });
  if (facts.isOverdue) chips.push({ label: facts.daysOverdue ? `Overdue ${facts.daysOverdue}d` : "Overdue", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200" });
  else if (facts.isDueToday) chips.push({ label: "Due today", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200" });
  else if (facts.dueDate) chips.push({ label: `Due ${formatDateLabel(facts.dueDate)}`, className: "border-border bg-background text-muted-foreground" });
  if (typeof facts.progressPercent === "number") chips.push({ label: `${facts.progressPercent}%`, className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200" });
  if (typeof facts.checklistDone === "number" && typeof facts.checklistTotal === "number" && facts.checklistTotal > 0) chips.push({ label: `${facts.checklistDone}/${facts.checklistTotal} checks`, className: "border-border bg-background text-muted-foreground" });
  if (typeof facts.actualMinutes === "number" && facts.actualMinutes > 0) chips.push({ label: `${formatKnowledgeMinutes(facts.actualMinutes)} tracked`, className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" });
  if (typeof facts.durationSec === "number") chips.push({ label: formatCompactDuration(facts.durationSec), className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" });
  if (typeof facts.timeEntryCount === "number") chips.push({ label: `${facts.timeEntryCount} entr${facts.timeEntryCount === 1 ? "y" : "ies"}`, className: "border-border bg-background text-muted-foreground" });
  if (facts.updatedAt) chips.push({ label: `Updated ${formatDateLabel(facts.updatedAt)}`, className: "border-border bg-background text-muted-foreground" });
  else if (facts.createdAt) chips.push({ label: `Created ${formatDateLabel(facts.createdAt)}`, className: "border-border bg-background text-muted-foreground" });
  if (facts.customer) chips.push({ label: facts.customer, className: "border-border bg-background text-muted-foreground" });
  if (facts.severity) chips.push({ label: `Severity ${facts.severity}`, className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200" });
  return chips.slice(0, 8);
}

function getWorkspaceKnowledgeCardSummary(source: WorkspaceAiAnswer["sources"][number]) {
  const facts = source.facts;
  if (facts?.latestNote) return facts.latestNote;
  if (facts?.notes) return facts.notes;
  if (facts?.description) return facts.description;
  if (facts?.investigation) return facts.investigation;
  if (facts?.resolution) return facts.resolution;
  return source.summary.split("\n").map((line) => line.trim()).filter(Boolean)[0] ?? "No additional details available.";
}

function formatKnowledgeMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function ArticleEditorDialog({ article, open, store, onClose, onSave }: { article: KnowledgeArticle | null; open: boolean; store: ReturnType<typeof useWorkspaceStore>; onClose: () => void; onSave: (article: KnowledgeArticle) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [resolution, setResolution] = useState("");
  const [tags, setTags] = useState("");
  const [references, setReferences] = useState("");
  const [linkType, setLinkType] = useState<"Task" | "Ticket" | "SQL" | "Note" | "File">("Task");
  const [linkId, setLinkId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !article) return;
    setTitle(article.title);
    setProblem(article.problem);
    setRootCause(article.rootCause);
    setResolution(article.resolution);
    setTags(article.tags.join(", "));
    setReferences(article.references.join("\n"));
    setLinkType("Task");
    setLinkId("");
    setError("");
  }, [article, open]);

  if (!open || !article) return null;
  const currentArticle = article;
  const linkOptions = getArticleLinkOptions(store, linkType);

  function addReferenceLink() {
    const selected = linkOptions.find((option) => option.id === linkId);
    if (!selected) return;
    const nextReference = `${linkType}: ${selected.label}`;
    const nextReferences = uniqueStrings([...splitLines(references), nextReference]);
    setReferences(nextReferences.join("\n"));
    setLinkId("");
  }

  async function saveArticle() {
    if (!title.trim()) {
      setError("Article title is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        ...currentArticle,
        title: title.trim(),
        problem: problem.trim() || "Problem statement.",
        rootCause: rootCause.trim() || "To be documented.",
        resolution: resolution.trim() || "Resolution notes.",
        tags: splitLinesOrCommas(tags),
        references: splitLines(references)
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save article.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">Edit knowledge article</h2>
            <p className="mt-1 text-xs text-muted-foreground">Maintain the reusable problem, cause, resolution, and linked references.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {error && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">{error}</p>}
          <LabeledField label="Title">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </LabeledField>
          <div className="grid gap-4 lg:grid-cols-2">
            <LabeledField label="Problem">
              <textarea value={problem} onChange={(event) => setProblem(event.target.value)} className="min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
            <LabeledField label="Root cause">
              <textarea value={rootCause} onChange={(event) => setRootCause(event.target.value)} className="min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
          </div>
          <LabeledField label="Resolution">
            <textarea value={resolution} onChange={(event) => setResolution(event.target.value)} className="min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm" />
          </LabeledField>
          <div className="grid gap-4 lg:grid-cols-2">
            <LabeledField label="Tags">
              <textarea value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Comma or line separated tags" className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
            <LabeledField label="References">
              <textarea value={references} onChange={(event) => setReferences(event.target.value)} placeholder={"Task: Task title\nTicket: Ticket number\nSQL: Query title\nFile: attachment.pdf"} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
          </div>
          <div className="rounded-xl border border-border bg-secondary/20 p-4">
            <p className="text-sm font-medium">Add related record</p>
            <p className="mt-1 text-xs text-muted-foreground">Pick an existing workspace record and it will be added to the article references in the correct format.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr_auto]">
              <select value={linkType} onChange={(event) => { setLinkType(event.target.value as typeof linkType); setLinkId(""); }} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
                {(["Task", "Ticket", "SQL", "Note", "File"] as const).map((type) => <option key={type}>{type}</option>)}
              </select>
              <select value={linkId} onChange={(event) => setLinkId(event.target.value)} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">Choose a record</option>
                {linkOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <Button type="button" variant="outline" disabled={!linkId} onClick={addReferenceLink}>Add link</Button>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border p-4">
          <Button className="w-full" disabled={saving} onClick={() => void saveArticle()}>{saving ? "Saving..." : "Save article"}</Button>
        </div>
      </div>
    </div>
  );
}

function SqlView({
  store,
  openCreate,
  notify,
  onSqlSave,
  initialSnippetId,
  onInitialSnippetHandled
}: ViewProps & {
  notify: (message: string) => void;
  onSqlSave?: (snippet: SqlSnippet) => Promise<void>;
  initialSnippetId?: string | null;
  onInitialSnippetHandled?: () => void;
}) {
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState("All");
  const [activeTag, setActiveTag] = useState("All");
  const [query, setQuery] = useState("");
  const editingSnippet = store.state.sqlSnippets.find((snippet) => snippet.id === editingSnippetId) ?? null;
  const folders = ["All", ...Array.from(new Set(store.state.sqlSnippets.map((snippet) => snippet.folder)))];
  const tags = ["All", ...Array.from(new Set(store.state.sqlSnippets.flatMap((snippet) => snippet.tags)))];
  const visibleSnippets = store.state.sqlSnippets.filter((snippet) => {
    const matchesFolder = activeFolder === "All" || snippet.folder === activeFolder;
    const matchesTag = activeTag === "All" || snippet.tags.includes(activeTag);
    const searchable = `${snippet.title} ${snippet.description} ${snippet.folder} ${snippet.tags.join(" ")} ${snippet.query}`.toLowerCase();
    const matchesQuery = !query.trim() || searchable.includes(query.trim().toLowerCase());
    return matchesFolder && matchesTag && matchesQuery;
  });

  useEffect(() => {
    if (!initialSnippetId) return;
    setEditingSnippetId(initialSnippetId);
    onInitialSnippetHandled?.();
  }, [initialSnippetId, onInitialSnippetHandled]);

  return (
    <div className="space-y-6">
      <ModuleHeader title="SQL Library" description="Store reusable SQL with folders, notes, tags, favorites, and one-click copy." icon={Code2} action="New SQL" onAction={() => openCreate("sql")} />
      {store.state.sqlSnippets.length === 0 ? (
        <EmptyState label="No SQL Library data available." />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-4">
            <LabeledField label="Search SQL">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, query, folder, tags, or description" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {folders.map((folder) => (
              <Button key={folder} variant={activeFolder === folder ? "primary" : "outline"} size="sm" onClick={() => setActiveFolder(folder)}>
                {folder}
              </Button>
            ))}
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {tags.map((tag) => (
              <Button key={tag} variant={activeTag === tag ? "primary" : "outline"} size="sm" onClick={() => setActiveTag(tag)}>
                {tag}
              </Button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleSnippets.map((snippet) => (
              <Card key={snippet.id}>
                <CardHeader>
                  <div>
                    <CardTitle>{snippet.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{snippet.folder} - {snippet.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{snippet.history.length} saved versions</p>
                    {snippet.executionNotes && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{snippet.executionNotes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {snippet.favorite && <Badge>Favorite</Badge>}
                    <Button variant="outline" size="sm" onClick={() => setEditingSnippetId(snippet.id)}><Pencil className="h-4 w-4" />Edit</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <HighlightedSqlCode query={snippet.query} />
                  <CopyAction text={snippet.query} label="Copy SQL" notify={notify} />
                </CardContent>
              </Card>
            ))}
            {visibleSnippets.length === 0 && <EmptyState label="No SQL Library data available for the selected filters." />}
          </div>
        </>
      )}
      <SqlEditorDialog snippet={editingSnippet} open={Boolean(editingSnippet)} store={store} notify={notify} onClose={() => setEditingSnippetId(null)} onSave={onSqlSave} />
    </div>
  );
}

function SqlEditorDialog({ snippet, open, store, notify, onClose, onSave }: { snippet: SqlSnippet | null; open: boolean; store: ReturnType<typeof useWorkspaceStore>; notify: (message: string) => void; onClose: () => void; onSave?: (snippet: SqlSnippet) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folder, setFolder] = useState("");
  const [executionNotes, setExecutionNotes] = useState("");
  const [tags, setTags] = useState("");
  const [query, setQuery] = useState("");
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    if (!open || !snippet) return;
    setTitle(snippet.title);
    setDescription(snippet.description);
    setFolder(snippet.folder);
    setExecutionNotes(snippet.executionNotes);
    setTags(snippet.tags.join(", "));
    setQuery(snippet.query);
    setFavorite(snippet.favorite);
  }, [open, snippet]);

  if (!open || !snippet) return null;
  const currentSnippet = snippet;

  async function saveSnippet() {
    const nextSnippet = {
      ...currentSnippet,
      title: title.trim() || "Untitled SQL",
      description,
      folder: folder.trim() || "General",
      executionNotes,
      tags: splitLinesOrCommas(tags),
      query,
      favorite
    };

    try {
      if (onSave) await onSave(nextSnippet);
      else store.updateSqlSnippet(nextSnippet);
      notify("SQL snippet saved.");
      window.setTimeout(() => notify(""), 2200);
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save SQL snippet.");
      window.setTimeout(() => notify(""), 2600);
    }
  }

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Code2 className="h-5 w-5 text-primary" />
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-0 bg-transparent text-lg font-semibold outline-none" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void saveSnippet()}><Save className="h-4 w-4" />Save</Button>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4 overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
            <LabeledField label="Description">
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
            <LabeledField label="Folder">
              <input value={folder} onChange={(event) => setFolder(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Execution notes">
              <textarea value={executionNotes} onChange={(event) => setExecutionNotes(event.target.value)} placeholder="When to run, expected parameters, caveats, and follow-up steps" className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
            <LabeledField label="Tags">
              <textarea value={tags} onChange={(event) => setTags(event.target.value)} className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm" />
            </LabeledField>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm">
              <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} />
              Favorite snippet
            </label>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Snippet history</p>
                <Badge>{currentSnippet.history.length}</Badge>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {currentSnippet.history.length === 0 && <p className="text-xs text-muted-foreground">No previous versions yet.</p>}
                {currentSnippet.history.map((version) => (
                  <div key={version.id} className="rounded-lg border border-border bg-secondary/20 p-2">
                    <p className="truncate text-xs font-medium">{version.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{version.folder} - {version.savedAt}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => {
                        store.restoreSqlSnippetVersion(currentSnippet.id, version.id);
                        notify("SQL snippet restored.");
                        window.setTimeout(() => notify(""), 2200);
                        onClose();
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
          <section className="grid min-h-0 gap-0 lg:grid-cols-2">
            <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
              <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Editor</div>
              <textarea value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} className="min-h-[520px] flex-1 resize-none bg-background p-5 font-mono text-sm leading-6 outline-none" />
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Highlighted preview</div>
              <div className="min-h-[520px] overflow-auto bg-background p-4">
                <HighlightedSqlCode query={query} expanded />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function HighlightedSqlCode({ query, expanded = false }: { query: string; expanded?: boolean }) {
  return (
    <pre className={cn("overflow-auto rounded-xl border border-border bg-slate-950 p-4 text-xs leading-5 text-slate-100", expanded ? "min-h-full" : "max-h-52")}>
      <code>{highlightSql(query)}</code>
    </pre>
  );
}

function highlightSql(query: string): ReactNode[] {
  const keywordPattern = /\b(select|from|where|join|left|right|inner|outer|on|group|by|order|having|insert|into|update|delete|values|set|and|or|not|null|is|in|as|case|when|then|else|end|limit|offset|count|sum|avg|min|max|distinct)\b/gi;
  return query.split(/(\b(?:select|from|where|join|left|right|inner|outer|on|group|by|order|having|insert|into|update|delete|values|set|and|or|not|null|is|in|as|case|when|then|else|end|limit|offset|count|sum|avg|min|max|distinct)\b|'[^']*'|--.*$|\b\d+\b)/gim)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (keywordPattern.test(part)) {
        keywordPattern.lastIndex = 0;
        return <span key={index} className="font-semibold text-sky-300">{part.toUpperCase()}</span>;
      }
      keywordPattern.lastIndex = 0;
      if (/^'[^']*'$/.test(part)) return <span key={index} className="text-emerald-300">{part}</span>;
      if (/^--/.test(part)) return <span key={index} className="text-slate-500">{part}</span>;
      if (/^\d+$/.test(part)) return <span key={index} className="text-amber-300">{part}</span>;
      return <span key={index}>{part}</span>;
    });
}

function CalendarView({
  store,
  openCreate,
  onReminderChange,
  onEventSave,
  onEventDelete,
  onTaskUpdate,
  onFileCreate
}: ViewProps & {
  onReminderChange?: (event: CalendarEvent, reminderEnabled: boolean, reminderMinutes: number) => Promise<void>;
  onEventSave?: (event: CalendarEvent) => Promise<void>;
  onEventDelete?: (event: CalendarEvent) => Promise<void>;
  onTaskUpdate?: (task: Task) => Promise<void>;
  onFileCreate?: (input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) => Promise<void>;
}) {
  const [mode, setMode] = useState<"day" | "week" | "month" | "agenda">("week");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarYearInput, setCalendarYearInput] = useState(() => String(new Date().getFullYear()));
  const calendarDays = getCalendarDays(calendarDate);
  const monthDays = getMonthCalendarDays(calendarDate);
  const eventBuckets = bucketCalendarEvents(store.state.events, calendarDays);
  const deadlineBuckets = bucketTaskDeadlines(store.state.tasks, calendarDays);
  const editingEvent = store.state.events.find((event) => event.id === editingEventId) ?? null;
  const selectedTask = store.state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedDateKey = toDateKey(calendarDate);
  const selectedDateLabel = calendarDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const selectedDayEvents = store.state.events.filter((event) => event.date === selectedDateKey);
  const selectedDayTasks = store.state.tasks.filter((task) => isTaskActiveOnDate(task, calendarDate));
  const monthLabel = calendarDate.toLocaleString(undefined, { month: "long", year: "numeric" });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    setCalendarYearInput(String(calendarDate.getFullYear()));
  }, [calendarDate]);

  useEffect(() => {
    if (notificationPermission !== "granted") return;
    const timers = store.state.events
      .filter((event) => event.reminderEnabled)
      .map((event) => window.setTimeout(() => {
        new Notification(`What's Next? reminder: ${event.title}`, {
          body: `${event.start} - ${event.end} (${event.type})`
        });
      }, calculateReminderDelay(event.date, event.start, event.reminderMinutes)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [notificationPermission, store.state.events]);

  async function requestNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title="Calendar" description="A focused agenda for meetings, reminders, and deep-work blocks." icon={CalendarDays} action="New event" onAction={() => openCreate("event")} />
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Browser reminders</p>
            <p className="text-xs text-muted-foreground">Permission: {formatNotificationPermission(notificationPermission)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={requestNotificationPermission} disabled={notificationPermission === "granted" || notificationPermission === "unsupported"}>
            Enable notifications
          </Button>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {(["day", "week", "month", "agenda"] as const).map((item) => (
          <Button key={item} variant={mode === item ? "primary" : "outline"} size="sm" onClick={() => setMode(item)}>
            {item[0].toUpperCase()}{item.slice(1)}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium">{mode === "month" ? monthLabel : selectedDateLabel}</p>
            <p className="text-xs text-muted-foreground">Browse historical and future work by day, week, month, or agenda.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(addMonths(calendarDate, -1))}>Previous month</Button>
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(addMonths(calendarDate, 1))}>Next month</Button>
            <Button variant="ghost" size="sm" onClick={() => setCalendarDate(new Date())}>Today</Button>
            <select value={calendarDate.getMonth()} onChange={(event) => setCalendarDate(new Date(calendarDate.getFullYear(), Number(event.target.value), 1))} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
              {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2026, index, 1).toLocaleString(undefined, { month: "short" })}</option>)}
            </select>
            <input
              aria-label="Calendar year"
              inputMode="numeric"
              value={calendarYearInput}
              onChange={(event) => setCalendarYearInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
              onBlur={() => {
                const year = Number.parseInt(calendarYearInput, 10);
                if (!Number.isFinite(year)) {
                  setCalendarYearInput(String(calendarDate.getFullYear()));
                  return;
                }
                const nextYear = Math.min(9999, Math.max(1970, year));
                setCalendarDate(new Date(nextYear, calendarDate.getMonth(), 1));
              }}
              className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {mode === "day" && (
        <Card>
          <CardHeader><CardTitle>{selectedDateLabel}</CardTitle><Badge>{selectedDayEvents.length + selectedDayTasks.length}</Badge></CardHeader>
          <CardContent className="space-y-3">
            {selectedDayEvents.map((event) => <CalendarEventRow key={event.id} event={event} store={store} onReminderChange={onReminderChange} onEdit={() => setEditingEventId(event.id)} />)}
            {selectedDayTasks.map((task) => <TaskFlowCalendarItem key={task.id} task={task} date={calendarDate} onOpen={setSelectedTaskId} />)}
            {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 && <EmptyState label="No Calendar data available for this day." />}
          </CardContent>
        </Card>
      )}

      {mode === "week" && (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
          <div className="grid w-max grid-cols-[repeat(7,220px)] gap-4 pr-4">
            {calendarDays.map((day) => (
              <Card key={day.key} className="min-h-72">
                <CardHeader>
                  <div>
                    <CardTitle>{day.label}</CardTitle>
                    <p className="text-xs text-muted-foreground">{day.date}</p>
                  </div>
                  <Badge>{(eventBuckets[day.key]?.length ?? 0) + (deadlineBuckets[day.key]?.length ?? 0)}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(eventBuckets[day.key] ?? []).map((event) => <CalendarEventMini key={event.id} event={event} store={store} onEdit={() => setEditingEventId(event.id)} />)}
                  {(deadlineBuckets[day.key] ?? []).map((task) => <TaskFlowCalendarItem key={task.id} task={task} date={new Date(`${day.key}T00:00:00`)} compact onOpen={setSelectedTaskId} />)}
                  {(eventBuckets[day.key]?.length ?? 0) + (deadlineBuckets[day.key]?.length ?? 0) === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No Calendar data available.</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {mode === "month" && (
        <Card>
          <CardHeader><CardTitle>{monthLabel}</CardTitle><Badge>{monthDays.filter((day) => day.inMonth).length} days</Badge></CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">{day}</div>)}
              {monthDays.map((day) => {
                const events = store.state.events.filter((event) => event.date === day.key);
                const tasks = store.state.tasks.filter((task) => day.inMonth && isTaskActiveOnDate(task, day.date));
                return (
                  <div key={day.key} className={cn("min-h-32 rounded-xl border border-border bg-background p-2", !day.inMonth && "border-dashed bg-secondary/20 opacity-60")}>
                    <p className={cn("text-xs font-semibold", day.key === toDateKey(new Date()) ? "text-primary" : "text-muted-foreground")}>{day.inMonth ? day.date.getDate() : ""}</p>
                    <div className="mt-2 space-y-1">
                      {events.slice(0, 2).map((event) => <button key={event.id} type="button" onClick={() => setEditingEventId(event.id)} className="w-full truncate rounded-md bg-primary/10 px-2 py-1 text-left text-[11px] text-primary">{event.start} {event.title}</button>)}
                      {tasks.slice(0, 3).map((task) => <TaskFlowPill key={task.id} task={task} date={day.date} onOpen={setSelectedTaskId} />)}
                      {events.length + tasks.length > 5 && <p className="text-[11px] text-muted-foreground">+{events.length + tasks.length - 5} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "agenda" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {store.state.events.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex items-center gap-4 p-5">
                <CalendarEventTime event={event} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-muted-foreground">{event.type}</p>
                  <CalendarEventLinks event={event} store={store} />
                  <p className="mt-1 text-xs text-muted-foreground">{event.reminderEnabled ? `${event.reminderMinutes}m reminder enabled` : "No reminder"}</p>
                </div>
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  <CalendarReminderControls event={event} store={store} onReminderChange={onReminderChange} />
                  <Button variant="outline" size="sm" onClick={() => setEditingEventId(event.id)}>Edit</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {store.state.tasks.filter((task) => parseTaskDate(task.due) || parseTaskDate(task.startDate)).map((task) => (
            <Card key={task.id}>
              <CardContent className="p-5">
                <TaskFlowCalendarItem task={task} date={parseTaskDate(task.due) ?? parseTaskDate(task.startDate) ?? new Date()} onOpen={setSelectedTaskId} />
              </CardContent>
            </Card>
          ))}
          {store.state.events.length === 0 && store.state.tasks.length === 0 && <EmptyState label="No Calendar data available." />}
        </div>
      )}
      <CalendarEventEditorDialog event={editingEvent} store={store} open={Boolean(editingEvent)} onClose={() => setEditingEventId(null)} onSave={onEventSave} onDelete={onEventDelete} />
      <TaskDrawer
        task={selectedTask}
        store={store}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdate={(previousTask, nextTask) => {
          store.upsertTask(nextTask);
          onTaskUpdate?.(nextTask).catch(() => store.upsertTask(previousTask));
        }}
        onFileCreate={onFileCreate}
      />
    </div>
  );
}

function CalendarEventRow({ event, store, onReminderChange, onEdit }: { event: WorkspaceState["events"][number]; store: ReturnType<typeof useWorkspaceStore>; onReminderChange?: (event: CalendarEvent, reminderEnabled: boolean, reminderMinutes: number) => Promise<void>; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-background p-3">
      <CalendarEventTime event={event} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{event.title}</p>
        <p className="text-sm text-muted-foreground">{event.type}</p>
        <CalendarEventLinks event={event} store={store} />
        <p className="mt-1 text-xs text-muted-foreground">{event.reminderEnabled ? `${event.reminderMinutes}m reminder enabled` : "No reminder"}</p>
      </div>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <CalendarReminderControls event={event} store={store} onReminderChange={onReminderChange} />
        <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}

function CalendarEventMini({ event, store, onEdit }: { event: WorkspaceState["events"][number]; store: ReturnType<typeof useWorkspaceStore>; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="w-full rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-primary/5">
      <p className="text-xs font-semibold text-primary">{event.start} - {event.end}</p>
      <p className="mt-1 line-clamp-2 text-sm font-medium">{event.title}</p>
      <CalendarEventLinks event={event} store={store} />
      <p className="mt-1 text-xs text-muted-foreground">{event.type} {event.reminderEnabled ? `- ${event.reminderMinutes}m reminder` : ""}</p>
    </button>
  );
}

function TaskDeadlineCalendarItem({ task, compact = false, onOpen }: { task: Task; compact?: boolean; onOpen?: (taskId: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen?.(task.id)} className={cn("w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-amber-900 transition hover:border-amber-400 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100", compact && "p-2")}>
      <p className="text-xs font-semibold uppercase">Task deadline</p>
      <p className={cn("mt-1 font-medium", compact ? "line-clamp-2 text-xs" : "text-sm")}>{task.title}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge>{task.priority}</Badge>
        <Badge>{task.status}</Badge>
        <Badge>{formatDateLabel(task.due)}</Badge>
      </div>
    </button>
  );
}

function TaskFlowCalendarItem({ task, date, compact = false, onOpen }: { task: Task; date: Date; compact?: boolean; onOpen?: (taskId: string) => void }) {
  const range = getTaskFlowRange(task);
  return (
    <button type="button" onClick={() => onOpen?.(task.id)} className={cn("w-full rounded-xl border p-3 text-left transition hover:shadow-sm", taskFlowClass(task, date), compact && "p-2")}>
      <p className="text-xs font-semibold uppercase">{taskFlowLabel(task, date)}</p>
      <p className={cn("mt-1 font-medium", compact ? "line-clamp-2 text-xs" : "text-sm")}>{task.title}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge>{task.priority}</Badge>
        <Badge>{task.status}</Badge>
        {range && <Badge>{formatDateLabel(toDateKey(range.start))} - {formatDateLabel(toDateKey(range.end))}</Badge>}
      </div>
    </button>
  );
}

function TaskFlowPill({ task, date, onOpen }: { task: Task; date: Date; onOpen?: (taskId: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen?.(task.id)} className={cn("w-full truncate rounded-md border px-2 py-1 text-left text-[11px]", taskFlowClass(task, date))}>
      {task.title}
    </button>
  );
}

function CalendarEventLinks({ event, store }: { event: CalendarEvent; store: ReturnType<typeof useWorkspaceStore> }) {
  const task = event.taskId ? store.state.tasks.find((item) => item.id === event.taskId) : null;
  const project = event.projectId ? store.state.projects.find((item) => item.id === event.projectId) : null;
  if (!task && !project) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {task && <Badge>{task.title}</Badge>}
      {project && <Badge>{project.name}</Badge>}
    </div>
  );
}

function CalendarEventEditorDialog({
  event,
  store,
  open,
  onClose,
  onSave,
  onDelete
}: {
  event: CalendarEvent | null;
  store: ReturnType<typeof useWorkspaceStore>;
  open: boolean;
  onClose: () => void;
  onSave?: (event: CalendarEvent) => Promise<void>;
  onDelete?: (event: CalendarEvent) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayInputDate());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [type, setType] = useState<CalendarEvent["type"]>("Focus");
  const [taskId, setTaskId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !event) return;
    setTitle(event.title);
    setDate(event.date);
    setStart(event.start);
    setEnd(event.end);
    setType(event.type);
    setTaskId(event.taskId ?? "");
    setProjectId(event.projectId ?? "");
    setConfirmDelete(false);
  }, [open, event]);

  if (!open || !event) return null;

  const nextEvent: CalendarEvent = {
    ...event,
    title: title.trim() || "Untitled event",
    date,
    start,
    end,
    type,
    taskId: taskId || undefined,
    projectId: projectId || undefined
  };

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()} className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-lg font-semibold">Edit event</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="space-y-4 p-4">
          <LabeledField label="Title">
            <input value={title} onChange={(changeEvent) => setTitle(changeEvent.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </LabeledField>
          <div className="grid gap-3 sm:grid-cols-4">
            <LabeledField label="Date">
              <input type="date" value={date} onChange={(changeEvent) => setDate(changeEvent.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Start">
              <input type="time" value={start} onChange={(changeEvent) => setStart(changeEvent.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="End">
              <input type="time" value={end} onChange={(changeEvent) => setEnd(changeEvent.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Type">
              <select value={type} onChange={(changeEvent) => setType(changeEvent.target.value as CalendarEvent["type"])} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {(["Meeting", "Focus", "Reminder"] as CalendarEvent["type"][]).map((item) => <option key={item}>{item}</option>)}
              </select>
            </LabeledField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="Linked task">
              <select value={taskId} onChange={(changeEvent) => setTaskId(changeEvent.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">No task</option>
                {store.state.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Linked project">
              <select value={projectId} onChange={(changeEvent) => setProjectId(changeEvent.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">No project</option>
                {store.state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </LabeledField>
          </div>
          {confirmDelete && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Click delete again to remove this event.</div>}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-border p-4">
          <Button
            variant="ghost"
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              void onDelete?.(event);
              onClose();
            }}
          >
            Delete
          </Button>
          <Button onClick={() => { void onSave?.(nextEvent); onClose(); }}>Save event</Button>
        </div>
      </div>
    </div>
  );
}

function CalendarReminderControls({ event, store, onReminderChange }: { event: WorkspaceState["events"][number]; store: ReturnType<typeof useWorkspaceStore>; onReminderChange?: (event: CalendarEvent, reminderEnabled: boolean, reminderMinutes: number) => Promise<void> }) {
  function updateReminder(reminderEnabled: boolean, reminderMinutes: number) {
    if (onReminderChange) {
      void onReminderChange(event, reminderEnabled, reminderMinutes);
      return;
    }
    store.setEventReminder(event.id, reminderEnabled, reminderMinutes);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={event.reminderEnabled}
          onChange={(changeEvent) => updateReminder(changeEvent.target.checked, event.reminderMinutes)}
        />
        Reminder
      </label>
      <select
        value={event.reminderMinutes}
        onChange={(changeEvent) => updateReminder(event.reminderEnabled, Number.parseInt(changeEvent.target.value, 10))}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      >
        {[5, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes}m</option>)}
      </select>
    </div>
  );
}

function CalendarEventTime({ event }: { event: WorkspaceState["events"][number] }) {
  return (
    <div className="rounded-xl bg-primary/10 px-3 py-2 text-center text-primary">
      <p className="text-sm font-semibold">{event.start}</p>
      <p className="text-xs">{event.end}</p>
    </div>
  );
}

function getCalendarDays(anchorDate: Date) {
  const selected = toDateOnly(anchorDate);
  const weekStart = new Date(selected);
  weekStart.setDate(selected.getDate() - selected.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: toDateKey(date),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    };
  });
}

function getMonthCalendarDays(anchorDate: Date) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const cells: Array<{ key: string; date: Date; inMonth: boolean }> = [];
  for (let index = 0; index < monthStart.getDay(); index += 1) {
    const date = new Date(monthStart);
    date.setDate(monthStart.getDate() - (monthStart.getDay() - index));
    cells.push({ key: toDateKey(date), date, inMonth: false });
  }
  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), day);
    cells.push({ key: toDateKey(date), date, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const date = new Date(monthEnd);
    date.setDate(monthEnd.getDate() + (cells.length % 7) + 1);
    cells.push({ key: toDateKey(date), date, inMonth: false });
  }
  return cells;
}

function bucketCalendarEvents(events: WorkspaceState["events"], days: ReturnType<typeof getCalendarDays>) {
  return events.reduce<Record<string, WorkspaceState["events"]>>((buckets, event) => {
    const key = event.date;
    if (!days.some((day) => day.key === key)) return buckets;
    buckets[key] = [...(buckets[key] ?? []), event];
    return buckets;
  }, {});
}

function bucketTaskDeadlines(tasks: Task[], days: ReturnType<typeof getCalendarDays>) {
  return tasks.reduce<Record<string, Task[]>>((buckets, task) => {
    days.forEach((day) => {
      if (!isTaskActiveOnDate(task, new Date(`${day.key}T00:00:00`))) return;
      buckets[day.key] = [...(buckets[day.key] ?? []), task];
    });
    return buckets;
  }, {});
}

function calculateReminderDelay(dateValue: string, startTime: string, reminderMinutes: number) {
  const [hours = "9", minutes = "0"] = startTime.split(":");
  const target = new Date(`${dateValue}T00:00:00`);
  target.setHours(Number.parseInt(hours, 10), Number.parseInt(minutes, 10) - reminderMinutes, 0, 0);
  return Math.max(1000, target.getTime() - Date.now());
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setDate(1);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function isTaskActiveOnDate(task: Task, date: Date) {
  const range = getTaskFlowRange(task);
  if (!range) return false;
  const currentTime = toDateOnly(date).getTime();
  return currentTime >= toDateOnly(range.start).getTime() && currentTime <= toDateOnly(range.end).getTime();
}

function getTaskFlowRange(task: Task) {
  const start = parseTaskDate(task.startDate) ?? parseTaskDate(task.due);
  const due = parseTaskDate(task.due);
  if (!start && !due) return null;

  const today = toDateOnly(new Date());
  const updatedAt = task.updatedAt ? new Date(task.updatedAt) : null;
  let end = due ?? start ?? today;
  if (task.status === "Done" && updatedAt && !Number.isNaN(updatedAt.getTime())) {
    end = toDateOnly(updatedAt);
  } else if (due && today.getTime() > toDateOnly(due).getTime()) {
    end = today;
  }

  const startDate = toDateOnly(start ?? end);
  const endDate = toDateOnly(end);
  return {
    start: startDate,
    due: due ? toDateOnly(due) : null,
    end: endDate.getTime() < startDate.getTime() ? startDate : endDate
  };
}

function taskFlowClass(task: Task, date: Date) {
  const range = getTaskFlowRange(task);
  const currentTime = toDateOnly(date).getTime();
  const dueTime = range?.due?.getTime();
  const endTime = range?.end.getTime();

  if (task.status === "Done") {
    if (dueTime && endTime && endTime > dueTime) {
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100";
    }
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100";
  }

  if (dueTime && currentTime > dueTime) {
    return "border-red-200 bg-red-50 text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100";
  }

  return "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-100";
}

function taskFlowLabel(task: Task, date: Date) {
  const range = getTaskFlowRange(task);
  const currentTime = toDateOnly(date).getTime();
  const dueTime = range?.due?.getTime();
  const endTime = range?.end.getTime();

  if (task.status === "Done") return dueTime && endTime && endTime > dueTime ? "Completed late" : "Completed on time";
  if (dueTime && currentTime > dueTime) return "Past due";
  return "Ongoing task";
}

function taskRequiresOverdueReason(task: Task) {
  return isPastDue(task.due) && !(task.overdueReason ?? "").trim();
}

function formatNotificationPermission(permission: NotificationPermission | "unsupported") {
  if (permission === "granted") return "Granted";
  if (permission === "denied") return "Denied";
  if (permission === "default") return "Not requested";
  return "Unsupported";
}

function TimeView({
  store,
  onStart,
  onManualEntry,
  onToggle,
  onStop
}: {
  store: ReturnType<typeof useWorkspaceStore>;
  onStart?: (title: string, taskId?: string) => Promise<void>;
  onManualEntry?: (title: string, minutes: number, taskId?: string) => Promise<void>;
  onToggle?: (timerId: string) => Promise<void>;
  onStop?: (timerId: string) => Promise<void>;
}) {
  const [manualTitle, setManualTitle] = useState("Manual work");
  const [manualMinutes, setManualMinutes] = useState("30");
  const [manualTaskId, setManualTaskId] = useState("");
  const [focusTaskId, setFocusTaskId] = useState("");
  const weeklyReport = getWeeklyTimeReport(store);
  const taskTimeReport = getTaskTimeReport(store);
  const projectTimeReport = getProjectTimeReport(store);
  const selectedFocusTask = store.state.tasks.find((task) => task.id === focusTaskId);

  return (
    <div className="space-y-6">
      <ModuleHeader title="Time Tracker" description="Start, pause, resume, and stop focus sessions." icon={Clock3} />
      <Card>
        <CardHeader><CardTitle>Start Focus</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select value={focusTaskId} onChange={(event) => setFocusTaskId(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">No linked task</option>
            {store.state.tasks.filter((task) => task.status !== "Done").map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
          <Button onClick={() => {
            const title = selectedFocusTask ? `Focus: ${selectedFocusTask.title}` : "Focused work";
            void onStart?.(title, focusTaskId || undefined);
          }}>
            <Play className="h-4 w-4" />
            Start focus
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Manual Entry</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto]">
          <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Work title" />
          <input value={manualMinutes} onChange={(event) => setManualMinutes(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" inputMode="numeric" placeholder="Minutes" />
          <select value={manualTaskId} onChange={(event) => setManualTaskId(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">No task</option>
            {store.state.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
          <Button
            onClick={() => {
              const title = manualTitle || "Manual work";
              const minutes = Math.max(0, Number.parseInt(manualMinutes, 10) || 0);
              void onManualEntry?.(title, minutes, manualTaskId || undefined);
              setManualTitle("Manual work");
              setManualMinutes("30");
              setManualTaskId("");
            }}
          >
            Add time
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {store.state.timeEntries.map((entry) => (
          <Card key={entry.id}>
            <CardHeader>
              <CardTitle>{entry.title}</CardTitle>
              <Badge>{entry.status}</Badge>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-3xl font-semibold">{formatSeconds(store.getTimerElapsed(entry))}</p>
              <div className="flex gap-2">
                {entry.status !== "Stopped" && <Button size="sm" onClick={() => { void onToggle?.(entry.id); }}>{entry.status === "Running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{entry.status === "Running" ? "Pause" : "Resume"}</Button>}
                {entry.status !== "Stopped" && <Button variant="outline" size="sm" onClick={() => { void onStop?.(entry.id); }}><Square className="h-4 w-4" />Stop</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Weekly Report</CardTitle><Badge>{formatCompactDuration(weeklyReport.totalSeconds)}</Badge></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-7">
          {weeklyReport.days.map((day) => (
            <div key={day.key} className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-semibold text-muted-foreground">{day.label}</p>
              <p className="mt-2 text-2xl font-semibold">{formatCompactDuration(day.seconds)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{day.entries} entries</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <TimeReportCard title="Time By Task" rows={taskTimeReport} empty="No task-linked time has been tracked yet." />
        <TimeReportCard title="Time By Project" rows={projectTimeReport} empty="No project-linked time has been tracked yet." />
      </div>
    </div>
  );
}

function TimeReportCard({ title, rows, empty }: { title: string; rows: Array<{ id: string; label: string; seconds: number; detail: string }>; empty: string }) {
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><Badge>{formatCompactDuration(total)}</Badge></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.label}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{row.detail}</p>
              </div>
              <Badge>{formatCompactDuration(row.seconds)}</Badge>
            </div>
            <Progress value={total ? Math.round((row.seconds / total) * 100) : 0} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function getWeeklyTimeReport(store: ReturnType<typeof useWorkspaceStore>) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = toDateKey(date);
    const entries = store.state.timeEntries.filter((entry) => toDateKey(new Date(entry.startedAt)) === key);
    const seconds = entries.reduce((total, entry) => total + store.getTimerElapsed(entry), 0);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      seconds,
      entries: entries.length
    };
  });
  return {
    days,
    totalSeconds: days.reduce((total, day) => total + day.seconds, 0)
  };
}

function getTaskTimeReport(store: ReturnType<typeof useWorkspaceStore>, range: { start: Date; end: Date } | null = null, taskIds?: Set<string>) {
  const rows = new Map<string, { id: string; label: string; seconds: number; detail: string }>();
  store.state.timeEntries.forEach((entry) => {
    if (!entry.taskId) return;
    if (taskIds && !taskIds.has(entry.taskId)) return;
    if (range) {
      const startedAt = new Date(entry.startedAt);
      if (startedAt < range.start || startedAt >= range.end) return;
    }
    const task = store.state.tasks.find((item) => item.id === entry.taskId);
    const seconds = store.getTimerElapsed(entry);
    const current = rows.get(entry.taskId) ?? {
      id: entry.taskId,
      label: task?.title ?? entry.title,
      seconds: 0,
      detail: task?.status ?? "Linked task"
    };
    current.seconds += seconds;
    rows.set(entry.taskId, current);
  });
  return Array.from(rows.values()).sort((a, b) => b.seconds - a.seconds);
}

function getProjectTimeReport(store: ReturnType<typeof useWorkspaceStore>) {
  const rows = new Map<string, { id: string; label: string; seconds: number; detail: string }>();
  store.state.timeEntries.forEach((entry) => {
    if (!entry.taskId) return;
    const task = store.state.tasks.find((item) => item.id === entry.taskId);
    if (!task?.projectId) return;
    const project = store.state.projects.find((item) => item.id === task.projectId);
    const seconds = store.getTimerElapsed(entry);
    const current = rows.get(task.projectId) ?? {
      id: task.projectId,
      label: project?.name ?? "Project",
      seconds: 0,
      detail: project?.due ? `Due ${project.due}` : "Linked project"
    };
    current.seconds += seconds;
    rows.set(task.projectId, current);
  });
  return Array.from(rows.values()).sort((a, b) => b.seconds - a.seconds);
}

function buildWorkspaceAiPrompt(prompt: string, state: WorkspaceState) {
  const openTasks = state.tasks.filter((task) => task.status !== "Done").slice(0, 8).map((task) => `- ${task.title} [${task.status}, ${task.priority}, due ${task.due}]`).join("\n");
  const tickets = state.tasks.filter((task) => task.workType === "Ticket").slice(0, 6).map((ticket) => `- ${ticket.ticketNumber ?? "Ticket"}: ${ticket.title} (${ticket.status}, ${ticket.severity ?? "Medium"})`).join("\n");
  const notes = state.notes.slice(0, 5).map((note) => `- ${note.title}: ${note.content.slice(0, 160)}`).join("\n");
  const sql = state.sqlSnippets.slice(0, 5).map((snippet) => `- ${snippet.title}: ${snippet.description}. Notes: ${snippet.executionNotes || "none"}`).join("\n");
  const timeMinutes = Math.round(state.timeEntries.reduce((total, entry) => total + entry.elapsedSeconds, 0) / 60);
  return `${prompt}

Workspace context:
Open tasks:
${openTasks || "- None"}

Tickets:
${tickets || "- None"}

Recent notes:
${notes || "- None"}

SQL snippets:
${sql || "- None"}

Tracked time this workspace: ${timeMinutes} minutes.

Return a concise, professional answer with priorities, summaries, and next actions where relevant.`;
}

function TemplatesView({ store, openCreate, notify, onTemplateSave }: ViewProps & { notify: (message: string) => void; onTemplateSave?: (template: Template) => Promise<void> }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const categories = ["All", "Favorites", ...Array.from(new Set(store.state.templates.map((template) => template.category)))];
  const visibleTemplates = store.state.templates.filter((template) => {
    if (activeCategory === "All") return true;
    if (activeCategory === "Favorites") return template.favorite;
    return template.category === activeCategory;
  });
  const selectedTemplate = store.state.templates.find((template) => template.id === selectedTemplateId) ?? null;

  return (
    <div className="space-y-6">
      <ModuleHeader title="Templates" description="Reusable emails, RCA formats, status updates, and documentation starters." icon={ClipboardCopy} action="New template" onAction={() => openCreate("template")} />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {categories.map((category) => (
          <Button key={category} variant={activeCategory === category ? "primary" : "outline"} size="sm" onClick={() => setActiveCategory(category)}>
            {category}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {visibleTemplates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge>{template.category}</Badge>
                {template.favorite && <Badge>Favorite</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">{template.body}</pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={async () => {
                  const nextTemplate = { ...template, favorite: !template.favorite };
                  if (onTemplateSave) await onTemplateSave(nextTemplate);
                  else store.toggleTemplateFavorite(template.id);
                }}>{template.favorite ? "Unfavorite" : "Favorite"}</Button>
                <Button size="sm" onClick={() => setSelectedTemplateId(template.id)}>Fill variables</Button>
                <CopyAction text={template.body} label="Copy raw" notify={notify} />
              </div>
            </CardContent>
          </Card>
        ))}
        {visibleTemplates.length === 0 && (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">No templates in this category.</CardContent>
          </Card>
        )}
      </div>
      <TemplateFillDialog template={selectedTemplate} notify={notify} onClose={() => setSelectedTemplateId(null)} />
    </div>
  );
}

function TemplateFillDialog({ template, notify, onClose }: { template: Template | null; notify: (message: string) => void; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!template) return;
    setValues(Object.fromEntries(template.variables.map((variable) => [variable, ""])));
  }, [template]);

  if (!template) return null;
  const rendered = renderTemplateBody(template.body, values);

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="grid max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
          <div>
            <h2 className="text-lg font-semibold">{template.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{template.category}</p>
          </div>
          {template.variables.length === 0 && <p className="text-sm text-muted-foreground">This template has no variables.</p>}
          {template.variables.map((variable) => (
            <LabeledField key={variable} label={variable}>
              <input value={values[variable] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [variable]: event.target.value }))} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
          ))}
          <Button className="w-full" onClick={() => {
            navigator.clipboard.writeText(rendered);
            notify("Filled template copied.");
            window.setTimeout(() => notify(""), 2200);
            onClose();
          }}>
            Copy filled template
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>Close</Button>
        </aside>
        <section className="min-h-[420px] overflow-y-auto p-5">
          <pre className="whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">{rendered}</pre>
        </section>
      </div>
    </div>
  );
}

function renderTemplateBody(body: string, values: Record<string, string>) {
  return body.replace(/{{\s*([^}]+)\s*}}/g, (_, variable: string) => values[variable.trim()] || `{{${variable.trim()}}}`);
}

type AnalyticsRangeMode = "week" | "month" | "quarter" | "all";

function AnalyticsView({ store }: { store: ReturnType<typeof useWorkspaceStore> }) {
  const [rangeMode, setRangeMode] = useState<AnalyticsRangeMode>("week");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "All">("All");
  const range = getAnalyticsRange(rangeMode);
  const rangedTasks = getTasksInRange(store.state.tasks, range);
  const filteredTasks = rangedTasks.filter((task) => {
    if (statusFilter !== "All" && task.status !== statusFilter) return false;
    if (priorityFilter !== "All" && task.priority !== priorityFilter) return false;
    return true;
  });
  const filteredTaskIds = new Set(filteredTasks.map((task) => task.id));
  const chartData = buildAnalyticsChartData(filteredTasks, store, rangeMode);
  const statusRows = taskStatuses.map((status) => ({ id: status, label: status, count: filteredTasks.filter((task) => task.status === status).length }));
  const priorityRows = priorities.map((priority) => ({ id: priority, label: priority, count: filteredTasks.filter((task) => task.priority === priority && task.status !== "Done").length }));
  const overdueTasks = filteredTasks.filter((task) => isTaskOverdue(task));
  const dueTasks = getTasksDueInRange(filteredTasks, range);
  const pendingTasks = filteredTasks.filter((task) => task.status === "Pending");
  const inProgressTasks = filteredTasks.filter((task) => task.status === "In Progress");
  const doneTasks = filteredTasks.filter((task) => task.status === "Done");
  const completionRate = filteredTasks.length ? Math.round((doneTasks.length / filteredTasks.length) * 100) : 0;
  const averageProgress = filteredTasks.length ? Math.round(filteredTasks.reduce((total, task) => total + calculateTaskProgress(task), 0) / filteredTasks.length) : 0;
  const projectRows = store.state.projects.map((project) => {
    const tasks = filteredTasks.filter((task) => task.projectId === project.id);
    return { id: project.id, label: project.name, count: getProjectProgress(project, tasks), detail: `${tasks.filter((task) => task.status !== "Done").length} open tasks` };
  });
  const timeRows = getTaskTimeReport(store, range, filteredTaskIds).slice(0, 6).map((row) => ({ id: row.id, label: row.label, count: row.seconds, displayValue: formatCompactDuration(row.seconds), detail: row.detail }));

  return (
    <div className="space-y-6">
      <ModuleHeader title="Analytics" description="Filtered operational metrics for tasks, due work, status, progress, and tracked time." icon={BarChart3} />
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <LabeledField label="Timeframe">
            <select value={rangeMode} onChange={(event) => setRangeMode(event.target.value as AnalyticsRangeMode)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="all">All time</option>
            </select>
          </LabeledField>
          <LabeledField label="Status">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "All")} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="All">All statuses</option>
              {taskStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="Priority">
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | "All")} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="All">All priorities</option>
              {priorities.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </LabeledField>
        </CardContent>
      </Card>
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric title="Tasks" value={String(filteredTasks.length)} detail={rangeMode === "all" ? "all time" : "in timeframe"} icon={Workflow} tone="indigo" />
        <Metric title="Due" value={String(dueTasks.length)} detail={`${overdueTasks.length} overdue`} icon={CalendarDays} tone="amber" />
        <Metric title="Pending" value={String(pendingTasks.length)} detail="on hold or waiting" icon={Pause} tone="amber" />
        <Metric title="In Progress" value={String(inProgressTasks.length)} detail="actively moving" icon={Play} tone="blue" />
        <Metric title="Avg Progress" value={`${averageProgress}%`} detail="filtered tasks" icon={Target} tone="emerald" />
        <Metric title="Completion" value={`${completionRate}%`} detail={`${doneTasks.length} done`} icon={CheckCircle2} tone="blue" />
      </section>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Productivity Report</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Due, completed, overdue, and focus activity for the selected timeframe.</p>
            </div>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="due" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                <Bar dataKey="completed" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                <Bar dataKey="overdue" fill="#EF4444" radius={[6, 6, 0, 0]} />
                <Bar dataKey="focus" fill="#10B981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <AnalyticsBreakdown title="Status Breakdown" rows={statusRows} suffix="tasks" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <AnalyticsBreakdown title="Open Priority" rows={priorityRows} suffix="tasks" />
        <AnalyticsBreakdown title="Project Progress" rows={projectRows} suffix="%" />
        <AnalyticsBreakdown title="Time By Task" rows={timeRows} suffix="" />
      </div>
    </div>
  );
}

function AnalyticsBreakdown({ title, rows, suffix }: { title: string; rows: Array<{ id: string; label: string; count: number; displayValue?: string; detail?: string }>; suffix: string }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><Badge>{rows.length}</Badge></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No data available yet.</p>}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.label}</p>
                {row.detail && <p className="mt-1 truncate text-xs text-muted-foreground">{row.detail}</p>}
              </div>
              <Badge>{row.displayValue ?? `${row.count}${suffix}`}</Badge>
            </div>
            <Progress value={total ? Math.round((row.count / total) * 100) : row.count} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FilesView({
  store,
  notify,
  initialFileId,
  onInitialFileHandled,
  onFileCreate,
  onFileDelete,
  onFileUpdate
}: {
  store: ReturnType<typeof useWorkspaceStore>;
  notify: (message: string) => void;
  initialFileId?: string | null;
  onInitialFileHandled?: () => void;
  onFileCreate?: (input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) => Promise<void>;
  onFileDelete?: (file: FileAsset) => Promise<void>;
  onFileUpdate?: (file: FileAsset, input: { name?: string; linkedType?: FileAsset["linkedType"]; linkedId?: string }) => Promise<void>;
}) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [linkedType, setLinkedType] = useState<FileAsset["linkedType"]>("None");
  const [linkedId, setLinkedId] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const linkOptions = getFileLinkOptions(store, linkedType);
  const selectedFile = store.state.files.find((file) => file.id === selectedFileId) ?? null;

  useEffect(() => {
    if (!initialFileId) return;
    setSelectedFileId(initialFileId);
    onInitialFileHandled?.();
  }, [initialFileId, onInitialFileHandled]);

  async function uploadFiles() {
    if (pendingFiles.length === 0 || uploading) return;
    setUploading(true);
    try {
      for (const file of pendingFiles) {
        const input = {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          linkedType,
          linkedId: linkedType === "None" ? undefined : linkedId || undefined
        };
        if (onFileCreate) await onFileCreate(input, file);
        else throw new Error("File upload is not configured for this workspace.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "File upload failed.");
      window.setTimeout(() => notify(""), 3200);
      setUploading(false);
      return;
    }
    notify(`${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} uploaded and linked.`);
    window.setTimeout(() => notify(""), 3600);
    setPendingFiles([]);
    setLinkedType("None");
    setLinkedId("");
    setFileInputKey((value) => value + 1);
    setUploading(false);
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title="Files" description="Upload files to workspace storage and link documents to tasks, projects, and notes." icon={FileText} />
      <Card>
        <CardHeader><CardTitle>Upload and Link</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className={cn("group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center transition hover:border-primary/50 hover:bg-primary/5", uploading && "pointer-events-none opacity-60")}>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
              <FileText className="h-5 w-5" />
            </span>
            <span className="mt-3 text-sm font-medium">{pendingFiles.length ? `${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} selected` : "Choose files to upload"}</span>
            <span className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Files are uploaded through the server, then linked to the selected workspace record.</span>
            <input key={fileInputKey} type="file" multiple disabled={uploading} onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))} className="hidden" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <LabeledField label="Link type">
              <select value={linkedType} onChange={(event) => { setLinkedType(event.target.value as FileAsset["linkedType"]); setLinkedId(""); }} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {(["None", "Task", "Project", "Note", "ProfileAvatar"] as FileAsset["linkedType"][]).map((type) => <option key={type} value={type}>{formatFileLinkedType(type)}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Linked item">
              <select value={linkedId} disabled={linkedType === "None"} onChange={(event) => setLinkedId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50">
                <option value="">No specific item</option>
                {linkOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
              </select>
            </LabeledField>
          </div>
          {pendingFiles.length > 0 && (
            <div className="rounded-xl border border-border bg-secondary/20 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-medium">Ready to upload</p>
                <Button variant="ghost" size="sm" onClick={() => { setPendingFiles([]); setFileInputKey((value) => value + 1); }}>Clear</Button>
              </div>
              {pendingFiles.map((file) => <p key={`${file.name}-${file.size}`} className="break-all text-muted-foreground">{file.name} - {formatFileSize(file.size)}</p>)}
            </div>
          )}
          <Button className="w-full sm:w-auto" disabled={pendingFiles.length === 0 || uploading} onClick={() => void uploadFiles()}>
            <FileText className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {store.state.files.map((file) => (
          <Card key={file.id} className="cursor-pointer transition hover:-translate-y-0.5 hover:shadow-soft" onClick={() => setSelectedFileId(file.id)}>
            <CardHeader className="items-start">
              <CardTitle className="min-w-0 break-all leading-6">{file.name}</CardTitle>
              <Badge title={file.linkedType} className="h-7 w-24 shrink-0 justify-center overflow-hidden text-ellipsis whitespace-nowrap">{file.linkedType}</Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{file.type || "Unknown type"} - {formatFileSize(file.size)}</p>
              <p>Uploaded {file.uploadedAt}</p>
              <p>Linked to {getFileLinkLabel(store, file)}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedFileId(file.id); }}>Open details</Button>
                <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); downloadFileAsset(file); }}>Download</Button>
                <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); void onFileDelete?.(file); }}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {store.state.files.length === 0 && <EmptyState label="No Files data available." />}
      </div>
      <FileDetailDrawer file={selectedFile} store={store} onClose={() => setSelectedFileId(null)} onDelete={onFileDelete} onUpdate={onFileUpdate} />
    </div>
  );
}

function FileDetailDrawer({ file, store, onClose, onDelete, onUpdate }: { file: FileAsset | null; store: ReturnType<typeof useWorkspaceStore>; onClose: () => void; onDelete?: (file: FileAsset) => Promise<void>; onUpdate?: (file: FileAsset, input: { name?: string; linkedType?: FileAsset["linkedType"]; linkedId?: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [linkedType, setLinkedType] = useState<FileAsset["linkedType"]>("None");
  const [linkedId, setLinkedId] = useState("");

  useEffect(() => {
    if (!file) return;
    setName(file.name);
    setLinkedType(file.linkedType);
    setLinkedId(file.linkedId ?? "");
  }, [file]);

  if (!file) return null;
  const isImage = file.type.startsWith("image/") && isDownloadableFileUrl(file.url);
  const linkOptions = getFileLinkOptions(store, linkedType);

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onMouseDown={onClose}>
      <motion.aside
        initial={{ x: 420 }}
        animate={{ x: 0 }}
        exit={{ x: 420 }}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">File Preview</p>
            <h2 className="mt-1 break-all text-2xl font-semibold tracking-normal">{file.name}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="mb-5 flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary/30">
          {isImage ? <img src={file.url} alt="" className="h-full w-full object-contain" /> : <FileText className="h-12 w-12 text-muted-foreground" />}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldCard label="Type" value={file.type || "Unknown"} />
          <FieldCard label="Size" value={formatFileSize(file.size)} />
          <FieldCard label="Uploaded" value={file.uploadedAt} />
          <FieldCard label="Linked To" value={getFileLinkLabel(store, file)} />
        </div>
        <div className="mt-5 space-y-3 rounded-xl border border-border bg-background p-4">
          <LabeledField label="File name">
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm" />
          </LabeledField>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="Link type">
              <select value={linkedType} onChange={(event) => { setLinkedType(event.target.value as FileAsset["linkedType"]); setLinkedId(""); }} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">
                {(["None", "Task", "Project", "Note", "ProfileAvatar"] as FileAsset["linkedType"][]).map((type) => <option key={type} value={type}>{formatFileLinkedType(type)}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Linked item">
              <select value={linkedId} disabled={linkedType === "None"} onChange={(event) => setLinkedId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-50">
                <option value="">No specific item</option>
                {linkOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
              </select>
            </LabeledField>
          </div>
          <Button variant="outline" onClick={() => { void onUpdate?.(file, { name: name.trim() || file.name, linkedType, linkedId: linkedType === "None" ? undefined : linkedId || undefined }); }}>
            Save file details
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadFileAsset(file)}>Download</Button>
          <Button variant="ghost" onClick={() => { void onDelete?.(file); onClose(); }}>Delete file</Button>
        </div>
      </motion.aside>
    </div>
  );
}

function getFileLinkOptions(store: ReturnType<typeof useWorkspaceStore>, linkedType: FileAsset["linkedType"]) {
  if (linkedType === "Task") return store.state.tasks.map((task) => ({ id: task.id, title: task.title }));
  if (linkedType === "Project") return store.state.projects.map((project) => ({ id: project.id, title: project.name }));
  if (linkedType === "Note") return store.state.notes.map((note) => ({ id: note.id, title: note.title }));
  return [];
}

function getFileLinkLabel(store: ReturnType<typeof useWorkspaceStore>, file: FileAsset) {
  if (file.linkedType === "None") return "workspace";
  if (file.linkedType === "Backup") return "workspace backup";
  if (file.linkedType === "ProfileAvatar") return "profile avatar";
  return getFileLinkOptions(store, file.linkedType).find((option) => option.id === file.linkedId)?.title ?? file.linkedType.toLowerCase();
}

function formatFileLinkedType(type: FileAsset["linkedType"]) {
  if (type === "ProfileAvatar") return "Profile avatar";
  return type;
}

function getLatestBackupCreatedAt(files: FileAsset[]) {
  return files
    .filter((file) => file.linkedType === "Backup")
    .map(backupTimestamp)
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => right - left)[0] ?? null;
}

function backupTimestamp(file: FileAsset) {
  return new Date(file.createdAt ?? file.uploadedAt).getTime();
}

function formatBackupDate(file: FileAsset) {
  const timestamp = backupTimestamp(file);
  if (!Number.isFinite(timestamp)) return file.uploadedAt;
  return new Date(timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function downloadFileAsset(file: FileAsset) {
  if (isDownloadableFileUrl(file.url)) {
    window.open(file.url, "_blank", "noopener,noreferrer");
    return;
  }
  window.alert("This file is not available for download. Configure workspace storage and re-upload the file.");
}

function isLocalFileUrl(url: string) {
  return url.startsWith("whatsnext://") || url.startsWith(`${"nex"}${"us"}://`);
}

function isDownloadableFileUrl(url?: string) {
  return Boolean(url) && !isLocalFileUrl(url ?? "");
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function PersonalView({ store, openCreate, openTasks }: { store: ReturnType<typeof useWorkspaceStore>; openCreate: (kind: CreateKind) => void; openTasks: () => void }) {
  const tags = ["personal", "finance", "fitness", "travel", "learning", "home"];
  const tasks = store.state.tasks.filter((task) => task.workType !== "Ticket" && task.tags.some((tag) => tags.includes(tag.toLowerCase()))).slice(0, 8);
  const notes = store.state.notes.filter((note) => note.tags.some((tag) => tags.includes(tag.toLowerCase()))).slice(0, 4);

  return (
    <FocusAreaView
      title="Personal"
      description="Personal planning, life admin, learning, travel, finance, and habit work from your persisted workspace."
      icon={Target}
      tasks={tasks}
      notes={notes}
      emptyLabel="Create personal task"
      onCreateTask={() => openCreate("task")}
      onOpenTasks={openTasks}
    />
  );
}

function GamingView({ store, openCreate, openTasks }: { store: ReturnType<typeof useWorkspaceStore>; openCreate: (kind: CreateKind) => void; openTasks: () => void }) {
  const tags = ["gaming", "game", "games", "stream", "guild", "backlog"];
  const tasks = store.state.tasks.filter((task) => task.tags.some((tag) => tags.includes(tag.toLowerCase())) || task.title.toLowerCase().includes("game")).slice(0, 8);
  const notes = store.state.notes.filter((note) => note.tags.some((tag) => tags.includes(tag.toLowerCase())) || note.title.toLowerCase().includes("game")).slice(0, 4);

  return (
    <FocusAreaView
      title="Gaming"
      description="Track game backlogs, events, squad notes, build ideas, and recurring gaming commitments without leaving the workspace."
      icon={Gamepad2}
      tasks={tasks}
      notes={notes}
      emptyLabel="Create gaming task"
      onCreateTask={() => openCreate("task")}
      onOpenTasks={openTasks}
    />
  );
}

function WorkspacesView({
  store,
  workspaces,
  activeWorkspaceId,
  activeWorkspace,
  onWorkspaceChange,
  onWorkspaceCreate,
  onWorkspaceSave,
  onWorkspaceArchive
}: {
  store: ReturnType<typeof useWorkspaceStore>;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId?: string;
  activeWorkspace?: WorkspaceSummary;
  onWorkspaceChange: (workspaceId: string) => void;
  onWorkspaceCreate: () => void;
  onWorkspaceSave: (input: { name?: string; slug?: string; icon?: string; color?: string }) => Promise<void>;
  onWorkspaceArchive: () => Promise<void>;
}) {
  const [workspaceName, setWorkspaceName] = useState(activeWorkspace?.name ?? "");
  const [workspaceSlug, setWorkspaceSlug] = useState(activeWorkspace?.slug ?? "");
  const [workspaceIcon, setWorkspaceIcon] = useState(activeWorkspace?.icon ?? "briefcase");
  const [workspaceColor, setWorkspaceColor] = useState(activeWorkspace?.color ?? "#4F46E5");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setWorkspaceName(activeWorkspace?.name ?? "");
    setWorkspaceSlug(activeWorkspace?.slug ?? "");
    setWorkspaceIcon(activeWorkspace?.icon ?? "briefcase");
    setWorkspaceColor(activeWorkspace?.color ?? "#4F46E5");
  }, [activeWorkspace]);

  return (
    <div className="space-y-6">
      <ModuleHeader title="Workspace" description="Switch, create, edit, and archive workspaces from one dedicated control page." icon={FolderKanban} action="New workspace" onAction={onWorkspaceCreate} />
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">{message}</div>}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {workspaces.map((workspace) => {
          const counts = getWorkspaceDisplayCounts(workspace, store, workspace.id === activeWorkspaceId);
          return (
          <Card key={workspace.id} className={cn("cursor-pointer transition hover:-translate-y-0.5 hover:shadow-soft", workspace.id === activeWorkspaceId && "border-primary ring-2 ring-primary/20")} onClick={() => onWorkspaceChange(workspace.id)}>
            <CardHeader>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: workspace.color ?? "#4F46E5" }}>{workspace.name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                  <CardTitle>{workspace.name}</CardTitle>
                  <p className="mt-1 truncate text-xs text-muted-foreground">/{workspace.slug}</p>
                </div>
              </div>
              {workspace.id === activeWorkspaceId && <Badge>Active</Badge>}
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
              <div className="rounded-lg border border-border bg-background p-2"><p className="font-semibold text-foreground">{counts.projects}</p><p>Projects</p></div>
              <div className="rounded-lg border border-border bg-background p-2"><p className="font-semibold text-foreground">{counts.tasks}</p><p>Tasks</p></div>
              <div className="rounded-lg border border-border bg-background p-2"><p className="font-semibold text-foreground">{counts.notes}</p><p>Notes</p></div>
            </CardContent>
          </Card>
        );})}
      </section>
      <SettingsPanel title="Active Workspace Control">
        <LabeledField label="Workspace name">
          <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        </LabeledField>
        <LabeledField label="Slug">
          <input value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        </LabeledField>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledField label="Icon">
            <input value={workspaceIcon ?? ""} onChange={(event) => setWorkspaceIcon(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </LabeledField>
          <LabeledField label="Color">
            <input type="color" value={workspaceColor} onChange={(event) => setWorkspaceColor(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background p-1" />
          </LabeledField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!activeWorkspace} onClick={async () => {
            await onWorkspaceSave({ name: workspaceName, slug: workspaceSlug, icon: workspaceIcon, color: workspaceColor });
            setMessage("Workspace saved.");
            window.setTimeout(() => setMessage(""), 2200);
          }}>Save workspace</Button>
          <Button variant="ghost" disabled={!activeWorkspace} onClick={async () => {
            await onWorkspaceArchive();
            setMessage("Workspace archived.");
            window.setTimeout(() => setMessage(""), 2200);
          }}>Archive workspace</Button>
        </div>
      </SettingsPanel>
    </div>
  );
}

function FocusAreaView({
  title,
  description,
  icon,
  tasks,
  notes,
  emptyLabel,
  onCreateTask,
  onOpenTasks
}: {
  title: string;
  description: string;
  icon: typeof Target;
  tasks: Task[];
  notes: Note[];
  emptyLabel: string;
  onCreateTask: () => void;
  onOpenTasks: () => void;
}) {
  const Icon = icon;
  const openTasks = tasks.filter((task) => task.status !== "Done");
  const urgentCount = tasks.filter((task) => task.priority === "Urgent" || task.priority === "High").length;

  return (
    <div className="space-y-6">
      <ModuleHeader title={title} description={description} icon={Icon} action={emptyLabel} onAction={onCreateTask} />
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Open items" value={String(openTasks.length)} detail="Persisted task records" icon={Workflow} tone="indigo" />
        <Metric title="High priority" value={String(urgentCount)} detail="Needs attention soon" icon={Target} tone="amber" />
        <Metric title="Completed" value={String(tasks.length - openTasks.length)} detail="Done in this focus area" icon={CheckCircle2} tone="blue" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Focus Queue</CardTitle>
            <Button variant="outline" size="sm" onClick={onOpenTasks}>Open Tasks</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                Tagged tasks will appear here automatically. Create a task and add a relevant tag to build this area.
              </div>
            )}
            {tasks.map((task) => (
              <button key={task.id} onClick={onOpenTasks} className="w-full rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-secondary/60">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{task.title}</p>
                  <Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{task.description || task.acceptanceCriteria || "No details added yet."}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{task.status}</span>
                  <span>{formatDateLabel(task.due)}</span>
                  {task.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Related Notes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notes.length === 0 && <p className="text-sm text-muted-foreground">Tagged notes will appear here once they are created.</p>}
            {notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-border bg-background p-4">
                <p className="font-medium">{note.title}</p>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{note.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getWorkspaceDisplayCounts(workspace: WorkspaceSummary, store: ReturnType<typeof useWorkspaceStore>, isActiveWorkspace: boolean) {
  if (workspace._count && !isActiveWorkspace) {
    return {
      projects: workspace._count.projects,
      tasks: workspace._count.tasks,
      notes: workspace._count.notes
    };
  }

  return {
    projects: store.state.projects.length,
    tasks: store.state.tasks.length,
    notes: store.state.notes.length
  };
}

function UtilityView({
  title,
  store,
  notify,
  user,
  token,
  activeWorkspace,
  onWorkspaceSave,
  onWorkspaceArchive,
  onProfileSaved,
  onBackupCreate,
  onBackupRestore,
  autoBackupIntervalHours,
  onAutoBackupIntervalChange,
  onTestNotification,
  onDailySummarySend,
  onDeadlineRemindersSend
}: {
  title: string;
  store: ReturnType<typeof useWorkspaceStore>;
  notify: (message: string) => void;
  user?: { id?: string; name: string; email: string; avatarUrl?: string | null; timezone?: string } | null;
  token?: string | null;
  activeWorkspace?: WorkspaceSummary;
  onWorkspaceSave?: (input: { name?: string; slug?: string; icon?: string; color?: string }) => Promise<void>;
  onWorkspaceArchive?: () => Promise<void>;
  onProfileSaved?: (user: NonNullable<ReturnType<typeof useAuth>["user"]>) => void;
  onBackupCreate?: (reason?: "manual" | "automatic") => Promise<FileAsset>;
  onBackupRestore?: (file: FileAsset) => Promise<BackupRestoreResult>;
  autoBackupIntervalHours: 0 | 12 | 24;
  onAutoBackupIntervalChange: (hours: 0 | 12 | 24) => void;
  onTestNotification?: (notification: Pick<WorkspaceNotification, "title" | "body" | "tone">) => void;
  onDailySummarySend?: () => Promise<{ delivered: boolean; subject: string; body: string }>;
  onDeadlineRemindersSend?: () => Promise<{ delivered: boolean; subject: string; body: string }>;
}) {
  const isControlPage = title === "Settings" || title === "Workspace";
  const [dailySummary, setDailySummary] = useState(true);
  const [deadlineAlerts, setDeadlineAlerts] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [shortcutHints, setShortcutHints] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRestoringId, setBackupRestoringId] = useState("");
  const [restoreConfirmId, setRestoreConfirmId] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profileAvatar, setProfileAvatar] = useState(user?.avatarUrl ?? "");
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileTimezone, setProfileTimezone] = useState(user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [workspaceName, setWorkspaceName] = useState(activeWorkspace?.name ?? "");
  const [workspaceSlug, setWorkspaceSlug] = useState(activeWorkspace?.slug ?? "");
  const [workspaceIcon, setWorkspaceIcon] = useState(activeWorkspace?.icon ?? "briefcase");
  const [workspaceColor, setWorkspaceColor] = useState(activeWorkspace?.color ?? "#4F46E5");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt: string; expiresAt: string; revokedAt?: string | null }>>([]);
  const [summaryPreview, setSummaryPreview] = useState("");
  const backupFiles = useMemo(() => store.state.files
    .filter((file) => file.linkedType === "Backup")
    .sort((left, right) => backupTimestamp(right) - backupTimestamp(left)), [store.state.files]);
  const activeAlerts = useWorkspaceNotifications(store);
  const calendarReminderEvents = useMemo(() => store.state.events.filter((event) => event.reminderEnabled), [store.state.events]);
  const runningTimer = store.metrics.runningTimer?.status === "Running" ? store.metrics.runningTimer : null;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    setProfileName(user?.name ?? "");
    setProfileAvatar(user?.avatarUrl ?? "");
    setProfileAvatarFile(null);
    setProfileTimezone(user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [user]);

  useEffect(() => {
    setWorkspaceName(activeWorkspace?.name ?? "");
    setWorkspaceSlug(activeWorkspace?.slug ?? "");
    setWorkspaceIcon(activeWorkspace?.icon ?? "briefcase");
    setWorkspaceColor(activeWorkspace?.color ?? "#4F46E5");
  }, [activeWorkspace]);

  useEffect(() => {
    if (title !== "Settings") return;
    listSessionsRequest(token)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [title, token]);

  async function createManualBackup() {
    setBackupSaving(true);
    setBackupMessage("");
    try {
      const backup = await onBackupCreate?.("manual");
      setBackupMessage(backup ? `Backup saved: ${backup.name}` : "Backup saved.");
      notify("Workspace backup uploaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workspace backup failed.";
      setBackupMessage(message);
      notify(message);
    } finally {
      setBackupSaving(false);
      window.setTimeout(() => notify(""), 3200);
    }
  }

  async function restoreBackup(file: FileAsset) {
    if (restoreConfirmId !== file.id) {
      setRestoreConfirmId(file.id);
      setBackupMessage(`Ready to restore ${file.name}. Click confirm restore to replace workspace records from this backup.`);
      return;
    }

    setBackupRestoringId(file.id);
    setBackupMessage("");
    try {
      const result = await onBackupRestore?.(file);
      const summary = result?.summary;
      setBackupMessage(summary ? `Restored ${summary.tasks} tasks, ${summary.projects} projects, ${summary.notes} notes, ${summary.articles} articles, ${summary.sqlSnippets} SQL snippets, ${summary.events} events, ${summary.templates} templates, and ${summary.timeEntries} time entries.` : "Workspace restored.");
      notify("Workspace restored from backup.");
      setRestoreConfirmId("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workspace restore failed.";
      setBackupMessage(message);
      notify(message);
    } finally {
      setBackupRestoringId("");
      window.setTimeout(() => notify(""), 3600);
    }
  }

  async function uploadProfileAvatar() {
    if (!profileAvatarFile) return profileAvatar || undefined;
    if (!activeWorkspace?.id) throw new Error("Select a workspace before uploading an avatar.");

    const uploadName = `avatar-${user?.id ?? "user"}-${profileAvatarFile.name}`;
    const uploaded = await uploadFileRequest(token, activeWorkspace.id, {
      name: uploadName,
      type: profileAvatarFile.type || "application/octet-stream",
      size: profileAvatarFile.size,
      linkedType: "ProfileAvatar",
      linkedId: user?.id
    }, profileAvatarFile);
    return getFileContentUrl(uploaded.id);
  }

  async function requestSettingsNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    notify(permission === "granted" ? "Browser notifications enabled." : "Browser notifications not enabled.");
    window.setTimeout(() => notify(""), 2400);
  }

  function sendTestBrowserNotification() {
    onTestNotification?.({
      title: "Test notification",
      body: "Notifications are visible inside What's Next?.",
      tone: "success"
    });
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification("What's Next? test notification", {
        body: "Notifications are ready for this browser."
      });
    }
    notify("Test notification added to the app.");
    window.setTimeout(() => notify(""), 2200);
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title={title} description="Manage profile, workspace, security, notifications, AI, backup, and keyboard preferences." icon={title === "Settings" ? Settings : FileText} />
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Current workspace has {store.state.tasks.length} tasks, {store.state.notes.length} notes, {store.state.tasks.filter((task) => task.workType === "Ticket").length} ticket tasks, and {store.state.sqlSnippets.length} SQL snippets.</p>
          {isControlPage && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="outline" disabled={backupSaving} onClick={() => void createManualBackup()}>{backupSaving ? "Saving backup..." : "Create backup"}</Button>
            </div>
          )}
        </CardContent>
      </Card>
      {isControlPage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SettingsPanel title="Profile">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              {profileAvatar ? <AuthenticatedImage src={profileAvatar} token={token} alt="" className="h-14 w-14 rounded-xl object-cover" fallback={<ProfileAvatarFallback />} /> : <ProfileAvatarFallback />}
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition hover:bg-secondary">
                Attach photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setProfileAvatarFile(file);
                    setProfileMessage(`${file.name} selected. Click Save profile to upload it to storage.`);
                    const reader = new FileReader();
                    reader.onload = () => setProfileAvatar(String(reader.result ?? ""));
                    reader.readAsDataURL(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            {profileMessage && <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">{profileMessage}</p>}
            <LabeledField label="Name">
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Avatar URL">
              <input value={profileAvatar ?? ""} onChange={(event) => setProfileAvatar(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Timezone">
              <input value={profileTimezone} onChange={(event) => setProfileTimezone(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <Button disabled={profileSaving} onClick={async () => {
              setProfileSaving(true);
              try {
                const avatarUrl = await uploadProfileAvatar();
                const updatedUser = await updateProfileRequest(token, { name: profileName, avatarUrl, timezone: profileTimezone });
                setProfileAvatarFile(null);
                setProfileAvatar(updatedUser.avatarUrl ?? avatarUrl ?? "");
                setProfileMessage(updatedUser.avatarUrl || avatarUrl ? "Profile saved. Photo uploaded." : "Profile saved.");
                onProfileSaved?.(updatedUser);
                notify("Profile settings saved.");
              } catch (error) {
                notify(error instanceof Error ? error.message : "Could not save profile.");
              } finally {
                setProfileSaving(false);
              }
              window.setTimeout(() => notify(""), 2400);
            }}>{profileSaving ? "Saving profile..." : profileAvatarFile ? "Save profile and upload photo" : "Save profile"}</Button>
          </SettingsPanel>
          <SettingsPanel title="Workspace">
            <LabeledField label="Workspace name">
              <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Slug">
              <input value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label="Icon">
                <input value={workspaceIcon ?? ""} onChange={(event) => setWorkspaceIcon(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </LabeledField>
              <LabeledField label="Color">
                <input type="color" value={workspaceColor} onChange={(event) => setWorkspaceColor(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background p-1" />
              </LabeledField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={async () => {
                try {
                  await onWorkspaceSave?.({ name: workspaceName, slug: workspaceSlug, icon: workspaceIcon, color: workspaceColor });
                  notify("Workspace settings saved.");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not save workspace.");
                }
                window.setTimeout(() => notify(""), 2400);
              }}>Save workspace</Button>
              <Button variant="ghost" onClick={async () => {
                try {
                  await onWorkspaceArchive?.();
                  notify("Workspace archived.");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not archive workspace.");
                }
                window.setTimeout(() => notify(""), 2400);
              }}>Archive workspace</Button>
            </div>
          </SettingsPanel>
          <SettingsPanel title="Security">
            <SettingsRow label="Session mode" value="JWT access token" />
            <SettingsRow label="Password hashing" value="Argon2 on backend" />
            <SettingsRow label="Logout behavior" value="Clears session and local workspace cache" />
            <LabeledField label="Current password">
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="New password">
              <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!currentPassword || !nextPassword} onClick={async () => {
                try {
                  await changePasswordRequest(token, { currentPassword, nextPassword });
                  setCurrentPassword("");
                  setNextPassword("");
                  notify("Password changed.");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not change password.");
                }
                window.setTimeout(() => notify(""), 2400);
              }}>Change password</Button>
              <Button variant="outline" onClick={async () => {
                try {
                  await logoutAllDevicesRequest(token);
                  notify("All sessions revoked.");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not revoke sessions.");
                }
                window.setTimeout(() => notify(""), 2400);
              }}>Logout all devices</Button>
            </div>
            <div className="space-y-2">
              {sessions.slice(0, 3).map((session) => <SettingsRow key={session.id} label={session.revokedAt ? "Revoked session" : "Active session"} value={new Date(session.createdAt).toLocaleDateString()} />)}
            </div>
          </SettingsPanel>
          <SettingsPanel title="Notifications">
            <ToggleRow label="Daily summary" checked={dailySummary} onChange={setDailySummary} />
            <ToggleRow label="Upcoming deadline alerts" checked={deadlineAlerts} onChange={setDeadlineAlerts} />
            <SettingsRow label="Browser permission" value={formatNotificationPermission(notificationPermission)} />
            <SettingsRow label="Active alerts" value={`${activeAlerts.length}`} />
            <SettingsRow label="Calendar reminders" value={`${calendarReminderEvents.length}`} />
            <SettingsRow label="Running timer" value={runningTimer ? runningTimer.title : "None"} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={notificationPermission === "granted" || notificationPermission === "unsupported"} onClick={() => void requestSettingsNotificationPermission()}>Enable browser alerts</Button>
              <Button variant="outline" onClick={sendTestBrowserNotification}>Send test alert</Button>
              <Button variant="outline" disabled={!dailySummary} onClick={async () => {
                try {
                  const result = await onDailySummarySend?.();
                  setSummaryPreview(result?.body ?? "");
                  notify(result?.delivered ? "Daily summary emailed." : "Daily summary delivery failed.");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not send daily summary.");
                }
                window.setTimeout(() => notify(""), 2600);
              }}>Send AI summary</Button>
              <Button variant="outline" disabled={!deadlineAlerts} onClick={async () => {
                try {
                  const result = await onDeadlineRemindersSend?.();
                  setSummaryPreview(result?.body ?? "");
                  notify(result?.delivered ? "Reminder digest emailed." : "Reminder delivery failed.");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Could not send reminders.");
                }
                window.setTimeout(() => notify(""), 2600);
              }}>Send reminder digest</Button>
            </div>
            <div className="space-y-2">
              {activeAlerts.length === 0 && <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">No active task or timer alerts.</p>}
              {activeAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className={cn("rounded-lg border border-border bg-background p-3", alert.tone === "warning" && "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.body}</p>
                    </div>
                    <Badge className={alert.tone === "warning" ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100" : ""}>{alert.tone === "warning" ? "Attention" : "Info"}</Badge>
                  </div>
                </div>
              ))}
            </div>
            {summaryPreview && <pre className="max-h-44 overflow-auto rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">{summaryPreview}</pre>}
          </SettingsPanel>
          <SettingsPanel title="AI">
            <ToggleRow label="Workspace AI assistant" checked={aiEnabled} onChange={setAiEnabled} />
            <SettingsRow label="Provider" value="OpenAI-compatible endpoint" />
            <SettingsRow label="Context" value="Tasks, tickets, notes, SQL, and time" />
            <HelpBlock
              title="Current AI entry points"
              body="AI is used in Dashboard suggestions, Dashboard summarize, command-palette AI search, daily-summary generation, Knowledge Base analysis, and workflow drafts for notes, tickets, SQL explanations, RCA, and professional emails."
            />
          </SettingsPanel>
          <SettingsPanel title="Backup and Restore">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <LabeledField label="Automatic backup">
                <select value={String(autoBackupIntervalHours)} onChange={(event) => onAutoBackupIntervalChange(Number(event.target.value) as 0 | 12 | 24)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="24">Every 24 hours</option>
                  <option value="12">Every 12 hours</option>
                  <option value="0">Off</option>
                </select>
              </LabeledField>
              <Button className="self-end" disabled={backupSaving} onClick={() => void createManualBackup()}>{backupSaving ? "Saving..." : "Create backup"}</Button>
            </div>
            <SettingsRow label="Saved backups" value={`${backupFiles.length} restore point${backupFiles.length === 1 ? "" : "s"}`} />
            {backupMessage && <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs leading-5 text-muted-foreground">{backupMessage}</p>}
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {backupFiles.length === 0 && <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">No backups saved yet.</p>}
              {backupFiles.map((file) => {
                const isConfirming = restoreConfirmId === file.id;
                const isRestoring = backupRestoringId === file.id;
                return (
                  <div key={file.id} className={cn("rounded-xl border border-border bg-background p-3", isConfirming && "border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatBackupDate(file)} - {formatFileSize(file.size)}</p>
                      </div>
                      <Button variant={isConfirming ? undefined : "outline"} size="sm" disabled={Boolean(backupRestoringId)} onClick={() => void restoreBackup(file)}>
                        {isRestoring ? "Restoring..." : isConfirming ? "Confirm restore" : "Restore"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsPanel>
          <SettingsPanel title="Application Controls">
            <SettingsRow label="Default module" value="Dashboard" />
            <SettingsRow label="Task board" value="Details, Kanban, Calendar, Timeline" />
            <SettingsRow label="File storage" value="Workspace object storage" />
            <SettingsRow label="Workspace control" value="Create from header, edit/archive here" />
          </SettingsPanel>
          <SettingsPanel title="Keyboard Shortcuts">
            <ToggleRow label="Show shortcut hints" checked={shortcutHints} onChange={setShortcutHints} />
            <SettingsRow label="Command palette" value="Ctrl + K" />
            <SettingsRow label="Create item" value="N" />
            <SettingsRow label="Dashboard / Tasks / Projects / Calendar" value="D / T / P / C" />
            <SettingsRow label="Close dialog" value="Esc" />
          </SettingsPanel>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function ProfileAvatarFallback() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <User className="h-6 w-6" />
    </div>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function HelpBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function handleModalKeyDown(event: KeyboardEvent<HTMLElement>, onClose: () => void) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function CreateDialog({
  kind,
  workspaceName,
  onClose,
  store,
  notify,
  onCreateTask,
  onCreateArticle,
  onCreateNote,
  onCreateProject,
  onCreateSql,
  onCreateEvent,
  onCreateTemplate
}: {
  kind: CreateKind | null;
  workspaceName: string;
  onClose: () => void;
  store: ReturnType<typeof useWorkspaceStore>;
  notify: (message: string) => void;
  onCreateTask?: (input: CreateTaskInput) => Promise<void>;
  onCreateArticle?: (input: CreateArticleInput) => Promise<void>;
  onCreateNote?: (input: CreateNoteInput) => Promise<void>;
  onCreateProject?: (input: CreateProjectInput) => Promise<void>;
  onCreateSql?: (input: CreateSqlSnippetInput) => Promise<void>;
  onCreateEvent?: (input: CreateCalendarEventInput) => Promise<void>;
  onCreateTemplate?: (input: CreateTemplateInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [extra, setExtra] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [projectIcon, setProjectIcon] = useState("folder-kanban");
  const [projectCoverUrl, setProjectCoverUrl] = useState("");
  const [taskStartDate, setTaskStartDate] = useState(todayInputDate());
  const [taskDueDate, setTaskDueDate] = useState(todayInputDate());
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskEstimate, setTaskEstimate] = useState("60");
  const [taskTags, setTaskTags] = useState("");
  const [taskChecklist, setTaskChecklist] = useState("");
  const [taskSubtasks, setTaskSubtasks] = useState("");
  const [taskDependencies, setTaskDependencies] = useState("");
  const [taskAcceptance, setTaskAcceptance] = useState("");
  const [taskRecurrence, setTaskRecurrence] = useState<RecurrenceRule>("None");
  const [ticketNumber, setTicketNumber] = useState("");
  const [ticketCustomer, setTicketCustomer] = useState("");
  const [ticketSeverity, setTicketSeverity] = useState<TicketSeverity>("Medium");
  const [ticketInvestigation, setTicketInvestigation] = useState("");
  const [articleRootCause, setArticleRootCause] = useState("");
  const [articleTags, setArticleTags] = useState("");
  const [articleReferences, setArticleReferences] = useState("");
  const [sqlFolder, setSqlFolder] = useState("General");
  const [sqlTags, setSqlTags] = useState("");
  const [sqlExecutionNotes, setSqlExecutionNotes] = useState("");
  const [sqlQuery, setSqlQuery] = useState("select *\nfrom table_name\nwhere created_at >= current_date - interval '7 days';");
  const [eventDate, setEventDate] = useState(() => todayInputDate());
  const [eventEndTime, setEventEndTime] = useState("10:30");
  const [eventType, setEventType] = useState<CalendarEvent["type"]>("Focus");
  const [eventTaskId, setEventTaskId] = useState("");
  const [eventProjectId, setEventProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!kind) return null;
  const currentKind = kind;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (currentKind === "task" || currentKind === "ticket") {
        const isTicket = currentKind === "ticket";
        const finalTicketNumber = isTicket ? ticketNumber || String(Math.floor(Math.random() * 9000 + 1000)) : undefined;
        const finalTitle = isTicket ? formatTicketTaskTitle(workspaceName, finalTicketNumber ?? "", title) : title;
        const taskInput: CreateTaskInput = {
          title: finalTitle,
          description: body || "Captured from What's Next?",
          projectId: taskProjectId || undefined,
          priority,
          startDate: taskStartDate,
          due: taskDueDate,
          estimateMinutes: Math.max(0, Number.parseInt(taskEstimate, 10) || 0),
          tags: isTicket ? ["ticket", ...splitLinesOrCommas(taskTags)] : splitLinesOrCommas(taskTags),
          checklist: splitLines(taskChecklist).map((label) => ({ id: `check-${Math.random().toString(36).slice(2, 9)}`, label, done: false })),
          subtasks: createSubtasksFromText(taskSubtasks, taskDueDate, priority),
          dependencies: splitLines(taskDependencies),
          recurringRule: taskRecurrence,
          acceptanceCriteria: taskAcceptance,
          workType: isTicket ? "Ticket" : "Task",
          ticketNumber: finalTicketNumber,
          customer: isTicket ? ticketCustomer || "Internal" : undefined,
          severity: isTicket ? ticketSeverity : undefined,
          investigation: isTicket ? ticketInvestigation : undefined
        };
        if (!onCreateTask) throw new Error("Creating tasks requires a backend workspace.");
        await onCreateTask(taskInput);
        if (isTicket) {
          const articleInput: CreateArticleInput = {
            title: `Knowledge draft: ${finalTitle}`,
            problem: body || finalTitle,
            rootCause: "To be documented during investigation.",
            resolution: "To be updated when the ticket is resolved.",
            tags: ["ticket", "auto-linked", ...splitLinesOrCommas(taskTags)],
            references: [`Ticket: ${finalTicketNumber}`, `Task: ${finalTitle}`]
          };
          if (!onCreateArticle) throw new Error("Creating knowledge articles requires a backend workspace.");
          await onCreateArticle(articleInput);
        }
      }
      if (currentKind === "project") {
        const projectInput = { name: title, description: body || "New project.", due: extra || "TBD", icon: projectIcon, coverUrl: projectCoverUrl };
        if (!onCreateProject) throw new Error("Creating projects requires a backend workspace.");
        await onCreateProject(projectInput);
      }
      if (currentKind === "note") {
        const noteInput = { title, content: body || "New note content.", tags: extra ? [extra] : ["note"] };
        if (!onCreateNote) throw new Error("Creating notes requires a backend workspace.");
        await onCreateNote(noteInput);
      }
      if (currentKind === "sql") {
        const sqlInput = {
          title,
          description: body || "Reusable query.",
          query: sqlQuery || "select * from table_name;",
          folder: sqlFolder || "General",
          tags: splitLinesOrCommas(sqlTags),
          executionNotes: sqlExecutionNotes
        };
        if (!onCreateSql) throw new Error("Creating SQL snippets requires a backend workspace.");
        await onCreateSql(sqlInput);
      }
      if (currentKind === "article") {
        const parsedArticleTags = splitLinesOrCommas(articleTags);
        const articleInput = {
          title,
          problem: body || "Problem statement.",
          rootCause: articleRootCause || "To be documented.",
          resolution: extra || "Resolution notes.",
          tags: parsedArticleTags.length ? parsedArticleTags : ["documentation"],
          references: splitLines(articleReferences)
        };
        if (!onCreateArticle) throw new Error("Creating knowledge articles requires a backend workspace.");
        await onCreateArticle(articleInput);
      }
      if (currentKind === "event") {
        const eventInput: CreateCalendarEventInput = {
          title,
          date: eventDate,
          start: extra || "10:00",
          end: eventEndTime || "10:30",
          type: eventType,
          taskId: eventTaskId || undefined,
          projectId: eventProjectId || undefined
        };
        if (!onCreateEvent) throw new Error("Creating calendar events requires a backend workspace.");
        await onCreateEvent(eventInput);
      }
      if (currentKind === "template") {
        const templateInput = { name: title, category: extra || "General", body: body || "Template body..." };
        if (!onCreateTemplate) throw new Error("Creating templates requires a backend workspace.");
        await onCreateTemplate(templateInput);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Create failed.");
      window.setTimeout(() => notify(""), 2400);
      setSubmitting(false);
      return;
    }
    setTitle("");
    setBody("");
    setExtra("");
    setPriority("Medium");
    setProjectIcon("folder-kanban");
    setProjectCoverUrl("");
    setTaskStartDate(todayInputDate());
    setTaskDueDate(todayInputDate());
    setTaskProjectId("");
    setTaskEstimate("60");
    setTaskTags("");
    setTaskChecklist("");
    setTaskSubtasks("");
    setTaskDependencies("");
    setTaskAcceptance("");
    setTaskRecurrence("None");
    setTicketNumber("");
    setTicketCustomer("");
    setTicketSeverity("Medium");
    setTicketInvestigation("");
    setArticleRootCause("");
    setArticleTags("");
    setArticleReferences("");
    setSqlFolder("General");
    setSqlTags("");
    setSqlExecutionNotes("");
    setSqlQuery("select *\nfrom table_name\nwhere created_at >= current_date - interval '7 days';");
    setEventDate(todayInputDate());
    setEventEndTime("10:30");
    setEventType("Focus");
    setEventTaskId("");
    setEventProjectId("");
    notify(`${currentKind[0].toUpperCase()}${currentKind.slice(1)} created.`);
    window.setTimeout(() => notify(""), 2200);
    setSubmitting(false);
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-semibold">Create {kind}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">
          <LabeledField label={currentKind === "task" ? "Task title" : "Title"}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write a clear title" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </LabeledField>
          <LabeledField label={currentKind === "task" ? "Description" : currentKind === "article" ? "Problem" : "Description / content / customer"}>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add context and relevant details" className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </LabeledField>
          {!["task", "ticket", "sql"].includes(currentKind) && (
            <LabeledField label={currentKind === "article" ? "Resolution" : currentKind === "project" ? "Due date" : currentKind === "event" ? "Start time" : "Extra detail"}>
              <input value={extra} onChange={(event) => setExtra(event.target.value)} placeholder={currentKind === "article" ? "How this issue is resolved" : currentKind === "project" ? "Jul 18, Q3, or a target date" : currentKind === "event" ? "10:00" : "Due date, ticket number, tag, SQL, or time"} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </LabeledField>
          )}
          {currentKind === "sql" && (
            <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledField label="Folder">
                  <input value={sqlFolder} onChange={(event) => setSqlFolder(event.target.value)} placeholder="Incident queries, Reporting, DBA" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </LabeledField>
                <LabeledField label="Database tags">
                  <input value={sqlTags} onChange={(event) => setSqlTags(event.target.value)} placeholder="postgres, billing, readonly" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </LabeledField>
              </div>
              <LabeledField label="Execution notes">
                <textarea value={sqlExecutionNotes} onChange={(event) => setSqlExecutionNotes(event.target.value)} placeholder="Parameters, expected runtime, permissions, caveats, and rollback notes" className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="SQL template">
                <textarea value={sqlQuery} onChange={(event) => setSqlQuery(event.target.value)} spellCheck={false} className="min-h-48 w-full rounded-lg border border-border bg-slate-950 p-3 font-mono text-sm leading-6 text-slate-100 outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
            </div>
          )}
          {currentKind === "event" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label="Event date">
                <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="End time">
                <input type="time" value={eventEndTime} onChange={(event) => setEventEndTime(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Event type">
                <select value={eventType} onChange={(event) => setEventType(event.target.value as CalendarEvent["type"])} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {(["Meeting", "Focus", "Reminder"] as CalendarEvent["type"][]).map((type) => <option key={type}>{type}</option>)}
                </select>
              </LabeledField>
              <LabeledField label="Linked task">
                <select value={eventTaskId} onChange={(event) => setEventTaskId(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">No task</option>
                  {store.state.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </LabeledField>
              <LabeledField label="Linked project">
                <select value={eventProjectId} onChange={(event) => setEventProjectId(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">No project</option>
                  {store.state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </LabeledField>
            </div>
          )}
          {currentKind === "project" && (
            <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
              <LabeledField label="Project icon">
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {projectIconOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-label={option.label}
                        onClick={() => setProjectIcon(option.value)}
                        className={cn(
                          "flex h-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary",
                          projectIcon === option.value && "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </LabeledField>
              <LabeledField label="Cover image URL">
                <input value={projectCoverUrl} onChange={(event) => setProjectCoverUrl(event.target.value)} placeholder="https://images.unsplash.com/..." className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <div className="grid grid-cols-3 gap-2">
                {projectCoverPresets.map((coverUrl) => (
                  <button
                    key={coverUrl}
                    type="button"
                    aria-label="Use cover preset"
                    onClick={() => setProjectCoverUrl(coverUrl)}
                    className={cn("h-16 rounded-lg border border-border bg-cover bg-center transition hover:ring-2 hover:ring-primary/30", projectCoverUrl === coverUrl && "ring-2 ring-primary")}
                    style={{ backgroundImage: `url(${coverUrl})` }}
                  />
                ))}
              </div>
            </div>
          )}
          {currentKind === "article" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label="Root cause">
                <textarea value={articleRootCause} onChange={(event) => setArticleRootCause(event.target.value)} placeholder="Why this happened" className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Tags">
                <textarea value={articleTags} onChange={(event) => setArticleTags(event.target.value)} placeholder="Comma or line separated tags" className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="References">
                <textarea value={articleReferences} onChange={(event) => setArticleReferences(event.target.value)} placeholder={"Task: Task title\nTicket: NX-1234\nSQL: Query title\nNote: Note title\nFile: attachment.pdf"} className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
            </div>
          )}
          {["task", "ticket"].includes(kind) && (
            <LabeledField label="Priority">
              <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {priorities.map((item) => <option key={item}>{item}</option>)}
              </select>
            </LabeledField>
          )}
          {["task", "ticket"].includes(currentKind) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label="Start date">
                <input type="date" value={taskStartDate} onChange={(event) => setTaskStartDate(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Due date">
                <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} min={taskStartDate} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Project">
                <select value={taskProjectId} onChange={(event) => setTaskProjectId(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">No project</option>
                  {store.state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </LabeledField>
              <LabeledField label="Estimated minutes">
                <input value={taskEstimate} onChange={(event) => setTaskEstimate(event.target.value)} placeholder="Estimate minutes" inputMode="numeric" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Repeats">
                <select value={taskRecurrence} onChange={(event) => setTaskRecurrence(event.target.value as RecurrenceRule)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {recurrenceRules.map((rule) => <option key={rule}>{rule}</option>)}
                </select>
              </LabeledField>
            </div>
          )}
          {currentKind === "ticket" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label="Ticket number">
                <input value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder="NX-1234" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Customer">
                <input value={ticketCustomer} onChange={(event) => setTicketCustomer(event.target.value)} placeholder="Internal, client, team, or account" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Severity">
                <select value={ticketSeverity} onChange={(event) => setTicketSeverity(event.target.value as TicketSeverity)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {(["Low", "Medium", "High", "Critical"] as TicketSeverity[]).map((severity) => <option key={severity}>{severity}</option>)}
                </select>
              </LabeledField>
              <LabeledField label="Investigation">
                <textarea value={ticketInvestigation} onChange={(event) => setTicketInvestigation(event.target.value)} placeholder="What is known so far?" className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
            </div>
          )}
          {["task", "ticket"].includes(currentKind) && (
            <>
              <LabeledField label="Tags">
                <input value={taskTags} onChange={(event) => setTaskTags(event.target.value)} placeholder="Comma separated tags" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Checklist">
                <textarea value={taskChecklist} onChange={(event) => setTaskChecklist(event.target.value)} placeholder="One checklist item per line" className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Subtasks">
                <textarea value={taskSubtasks} onChange={(event) => setTaskSubtasks(event.target.value)} placeholder="One subtask per line" className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Dependencies">
                <textarea value={taskDependencies} onChange={(event) => setTaskDependencies(event.target.value)} placeholder="One dependency per line" className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
              <LabeledField label="Acceptance criteria">
                <textarea value={taskAcceptance} onChange={(event) => setTaskAcceptance(event.target.value)} placeholder="Definition of done" className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </LabeledField>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-border p-5">
          <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Creating..." : "Create"}</Button>
        </div>
      </form>
    </div>
  );
}

function ProjectCards({
  store,
  projects: providedProjects,
  expanded = false,
  archived = false,
  onOpen,
  onProjectSave,
  onProjectArchive,
  onProjectUnarchive
}: {
  store: ReturnType<typeof useWorkspaceStore>;
  projects?: Project[];
  expanded?: boolean;
  archived?: boolean;
  onOpen?: (projectId: string) => void;
  onProjectSave?: (project: Project) => Promise<void>;
  onProjectArchive?: (project: Project) => Promise<void>;
  onProjectUnarchive?: (project: Project) => Promise<void>;
}) {
  const projects = providedProjects ?? (expanded ? store.state.projects.filter((project) => !project.archived) : store.metrics.pinnedProjects.filter((project) => !project.archived));
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [archiveProjectTarget, setArchiveProjectTarget] = useState<Project | null>(null);
  return (
    <>
      <div className={cn("grid gap-4", expanded ? "lg:grid-cols-2 xl:grid-cols-3" : "")}>
        {projects.map((project) => {
          const projectTasks = store.state.tasks.filter((task) => task.projectId === project.id);
          const count = projectTasks.length;
          const progress = getProjectProgress(project, projectTasks);
          return (
            <Card key={project.id} className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft">
              <ProjectCoverImage project={project} className="h-28" />
              <CardContent className="p-5">
                <div className="mb-4 flex items-start gap-3">
                  <ProjectIconTile icon={project.icon} className="h-10 w-10 text-white" style={{ backgroundColor: project.color }} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.description}</p>
                  </div>
                  <Badge>{project.due}</Badge>
                  {project.archived && <Badge>Archived</Badge>}
                </div>
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>{count} tasks</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
                {onOpen && (
                  <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => onOpen(project.id)}>
                    Open details
                  </Button>
                )}
                {expanded && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {!archived && <Button variant="outline" size="sm" onClick={() => { void onProjectSave?.({ ...project, pinned: !project.pinned }); }}>{project.pinned ? "Unpin" : "Pin"}</Button>}
                    <Button variant="outline" size="sm" onClick={() => setEditingProject(project)}>Edit</Button>
                    {archived ? (
                      <Button variant="ghost" size="sm" onClick={() => { void onProjectUnarchive?.(project); }}>Unarchive</Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setArchiveProjectTarget(project)}>Archive project</Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {projects.length === 0 && (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">{archived ? "No archived projects." : "No active projects yet."}</CardContent>
          </Card>
        )}
      </div>
      <ProjectEditorDialog project={editingProject} open={Boolean(editingProject)} onClose={() => setEditingProject(null)} onSave={onProjectSave} />
      {archiveProjectTarget && (
        <ConfirmDialog
          title="Archive project and hide it?"
          description="Archiving hides this project from active project lists. It does not delete linked tasks, notes, files, or history."
          confirmLabel="Archive project"
          onCancel={() => setArchiveProjectTarget(null)}
          onConfirm={() => {
            const project = archiveProjectTarget;
            setArchiveProjectTarget(null);
            void onProjectArchive?.(project);
          }}
        />
      )}
    </>
  );
}

function KanbanPreview({ store }: { store: ReturnType<typeof useWorkspaceStore> }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Kanban Snapshot</CardTitle>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">A compact preview of open task cards grouped by status. Open Tasks and switch to Kanban for the full board.</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["Todo", "In Progress", "Review"] as TaskStatus[]).map((status) => (
            <div key={status} className="rounded-xl border border-border bg-background p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">{status}</h3>
              <div className="space-y-2">
                {store.state.tasks.filter((task) => task.status === status).slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-lg border border-border bg-card p-2 text-xs leading-5">{task.title}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskCalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (taskId: string) => void }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const undatedTasks = tasks.filter((task) => !parseTaskDate(task.due));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Tasks are placed by due date. Select a card to open full details.</p>
        </div>
        <Badge>{tasks.filter((task) => task.status !== "Done").length} open</Badge>
      </CardHeader>
      <CardContent>
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-5 sm:px-5">
          <div className="grid min-w-[980px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="bg-secondary px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                {day}
              </div>
            ))}
            {days.map((date) => {
              const key = toDateKey(date);
              const dayTasks = tasks.filter((task) => taskDateKey(task.due) === key);
              const inCurrentMonth = date.getMonth() === today.getMonth();
              const isToday = key === toDateKey(today);

              return (
                <div key={key} className={cn("min-h-[138px] bg-card p-2", !inCurrentMonth && "bg-card/60 text-muted-foreground")}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", isToday && "bg-primary text-primary-foreground")}>
                      {date.getDate()}
                    </span>
                    {dayTasks.length > 0 && <Badge>{dayTasks.length}</Badge>}
                  </div>
                  <div className="space-y-1.5">
                    {dayTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onOpen(task.id)}
                        className={cn("w-full rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs leading-4 transition hover:border-primary/40", taskSurfaceClass(task))}
                      >
                        <span className="line-clamp-2 font-medium">{task.title}</span>
                        <span className={cn("mt-1 block", isTaskOverdue(task) ? "text-red-700 dark:text-red-200" : priorityTextClass(task.priority))}>{isTaskOverdue(task) ? "Overdue" : task.priority}</span>
                      </button>
                    ))}
                    {dayTasks.length > 3 && <p className="text-xs text-muted-foreground">+{dayTasks.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {undatedTasks.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Unscheduled</h3>
              <Badge>{undatedTasks.length}</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {undatedTasks.map((task) => (
                <button key={task.id} onClick={() => onOpen(task.id)} className={cn("rounded-lg border border-border bg-card p-3 text-left text-sm transition hover:border-primary/40", taskSurfaceClass(task))}>
                  <span className="font-medium">{task.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{task.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskTimelineView({ tasks, onOpen }: { tasks: Task[]; onOpen: (taskId: string) => void }) {
  const sortedTasks = [...tasks].sort((first, second) => {
    const firstDate = parseTaskDate(first.due) ?? parseTaskDate(first.startDate);
    const secondDate = parseTaskDate(second.due) ?? parseTaskDate(second.startDate);
    return (firstDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (secondDate?.getTime() ?? Number.MAX_SAFE_INTEGER);
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Task Timeline</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Review task windows from start date to due date, ordered by upcoming deadlines.</p>
        </div>
        <Badge>{sortedTasks.length} tasks</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedTasks.map((task) => {
          const startDate = parseTaskDate(task.startDate);
          const dueDate = parseTaskDate(task.due);
          const duration = startDate && dueDate ? Math.max(1, daysBetween(startDate, dueDate) + 1) : 1;
          const width = Math.min(100, Math.max(18, duration * 12));

          return (
            <button
              key={task.id}
              onClick={() => onOpen(task.id)}
              className={cn("grid w-full gap-4 rounded-xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm lg:grid-cols-[220px_minmax(0,1fr)_140px]", taskSurfaceClass(task))}
            >
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge className={isTaskOverdue(task) ? "border-red-200 bg-red-100 text-red-800 dark:border-red-400/30 dark:bg-red-400/20 dark:text-red-100" : undefined}>{isTaskOverdue(task) ? "Overdue" : task.status}</Badge>
                  <Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
                </div>
                <h3 className="truncate text-sm font-semibold">{task.title}</h3>
                <p className={cn("mt-1 text-xs text-muted-foreground", taskDueClass(task))}>{formatDateLabel(task.startDate)} to {formatDateLabel(task.due)}</p>
              </div>
              <div className="min-w-0 self-center">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>{duration} day{duration === 1 ? "" : "s"}</span>
                  <span>{task.progress}% complete</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary/30" style={{ width: `${width}%` }}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
              </div>
              <div className="self-center text-xs text-muted-foreground">
                <p>{task.estimateMinutes}m estimate</p>
                <p>{task.actualMinutes}m tracked</p>
              </div>
            </button>
          );
        })}
        {sortedTasks.length === 0 && <p className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">No tasks yet.</p>}
      </CardContent>
    </Card>
  );
}

function TaskDetailListItem({ task, store, onOpen }: { task: Task; store: ReturnType<typeof useWorkspaceStore>; onOpen: () => void }) {
  const project = store.state.projects.find((item) => item.id === task.projectId);
  const checklistDone = task.checklist.filter((item) => item.done).length;
  return (
    <button className={cn("w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft", taskSurfaceClass(task))} onClick={onOpen}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_140px] lg:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{task.title}</h3>
            <Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
            <Badge className={isTaskOverdue(task) ? "border-red-200 bg-red-100 text-red-800 dark:border-red-400/30 dark:bg-red-400/20 dark:text-red-100" : undefined}>{isTaskOverdue(task) ? "Overdue" : task.status}</Badge>
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{task.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {task.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        </div>
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">Project</p>
          <p className="truncate font-medium">{project?.name ?? "No project"}</p>
        </div>
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">Schedule</p>
          <p className={cn("truncate font-medium", taskDueClass(task))}>Due {formatDateLabel(task.due)}</p>
          <p className="text-xs text-muted-foreground">Starts {formatDateLabel(task.startDate)}</p>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>{checklistDone}/{task.checklist.length} checks</span>
            <span>{task.progress}%</span>
          </div>
          <Progress value={task.progress} />
        </div>
      </div>
    </button>
  );
}

function TaskKanbanCard({
  task,
  onOpen,
  onDragStart,
  onDragEnd
}: {
  task: Task;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      data-testid="task-kanban-card"
      className={cn("block w-full cursor-grab rounded-lg border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm active:cursor-grabbing", taskSurfaceClass(task))}
      draggable
      onClick={onOpen}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 break-words text-sm font-medium leading-5">{task.title}</h3>
        <Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
      </div>
      <p className={cn("mt-3 text-xs font-medium text-muted-foreground", taskDueClass(task))}>{isTaskOverdue(task) ? "Overdue" : "Due"} {formatDateLabel(task.due)}</p>
    </button>
  );
}

function TaskRow({
  task,
  store,
  compact = false,
  onOpen,
  onTaskStatusChange
}: {
  task: ReturnType<typeof useWorkspaceStore>["state"]["tasks"][number];
  store: ReturnType<typeof useWorkspaceStore>;
  compact?: boolean;
  onOpen?: () => void;
  onTaskStatusChange?: (taskId: string, status: TaskStatus, previousStatus?: TaskStatus) => Promise<void>;
}) {
  function changeStatus(status: TaskStatus) {
    const previousStatus = task.status;
    store.setTaskStatus(task.id, status);
    onTaskStatusChange?.(task.id, status, previousStatus).catch(() => store.setTaskStatus(task.id, previousStatus));
  }

  return (
    <div className={cn("rounded-xl border border-border bg-background p-4 transition hover:shadow-sm", onOpen && "cursor-pointer", taskSurfaceClass(task))} onClick={onOpen}>
      <div className="flex items-start gap-3">
        <button className={cn("mt-0.5 h-5 w-5 rounded-full border", task.status === "Done" && "border-emerald-500 bg-emerald-500")} onClick={(event) => { event.stopPropagation(); changeStatus(task.status === "Done" ? "Todo" : "Done"); }} aria-label={`Toggle ${task.title}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("break-words text-sm font-medium", task.status === "Done" && "text-muted-foreground line-through")}>{task.title}</h3>
            <Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
            {isTaskOverdue(task) && <Badge className="border-red-200 bg-red-100 text-red-800 dark:border-red-400/30 dark:bg-red-400/20 dark:text-red-100">Overdue</Badge>}
          </div>
          {!compact && <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{task.status}</span>
            <span className={taskDueClass(task)}>{task.due}</span>
            <span>{task.estimateMinutes}m estimate</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={task.progress} className="flex-1" />
            <select value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => changeStatus(event.target.value as TaskStatus)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs">
              {taskStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskDrawer({
  task,
  store,
  onClose,
	  onTaskStatusChange,
	  onTaskUpdate,
	  onPromoteTicket,
	  onFileCreate
	}: {
  task: Task | null;
  store: ReturnType<typeof useWorkspaceStore>;
  onClose: () => void;
	  onTaskStatusChange?: (taskId: string, status: TaskStatus, previousStatus?: TaskStatus) => void;
	  onTaskUpdate?: (previousTask: Task, nextTask: Task) => void;
	  onPromoteTicket?: (task: Task) => Promise<void>;
	  onFileCreate?: (input: Pick<FileAsset, "name" | "type" | "size" | "linkedType"> & Partial<Pick<FileAsset, "linkedId" | "url">>, file?: File) => Promise<void>;
	}) {
  const [noteBody, setNoteBody] = useState("");
  const [promotingArticle, setPromotingArticle] = useState(false);
  const [promoteError, setPromoteError] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
	  const [draftTags, setDraftTags] = useState("");
	  const [draftDependencies, setDraftDependencies] = useState("");
	  const [subtaskTitle, setSubtaskTitle] = useState("");
	  const [subtaskDue, setSubtaskDue] = useState("");
	  const [subtaskPriority, setSubtaskPriority] = useState<Priority>("Medium");
	  const [attachmentUploading, setAttachmentUploading] = useState(false);
	  const [attachmentError, setAttachmentError] = useState("");
  const [taskUpdateError, setTaskUpdateError] = useState("");
  const [showOverdueReason, setShowOverdueReason] = useState(false);
  const [draftAcceptanceCriteria, setDraftAcceptanceCriteria] = useState("");
  const [draftOverdueReason, setDraftOverdueReason] = useState("");
  const [draftTicketNumber, setDraftTicketNumber] = useState("");
  const [draftCustomer, setDraftCustomer] = useState("");
  const [draftSeverity, setDraftSeverity] = useState<TicketSeverity>("Medium");
  const [draftInvestigation, setDraftInvestigation] = useState("");
  const [draftResolution, setDraftResolution] = useState("");
  const [draftClosureNotes, setDraftClosureNotes] = useState("");

  useEffect(() => {
    if (!task) return;
    setDraftTitle(task.title);
	    setDraftDescription(task.description);
	    setDraftTags(task.tags.join(", "));
	    setDraftDependencies(task.dependencies.join("\n"));
	    setSubtaskTitle("");
	    setSubtaskDue(task.due === "TBD" ? "" : task.due);
	    setSubtaskPriority(task.priority);
    setDraftAcceptanceCriteria(task.acceptanceCriteria);
    setDraftOverdueReason(task.overdueReason ?? "");
    setDraftTicketNumber(task.ticketNumber ?? "");
    setDraftCustomer(task.customer ?? "");
    setDraftSeverity(task.severity ?? "Medium");
    setDraftInvestigation(task.investigation ?? "");
    setDraftResolution(task.resolution ?? "");
    setDraftClosureNotes(task.closureNotes ?? "");
    setPromoteError("");
	    setAttachmentError("");
    setTaskUpdateError("");
    setShowOverdueReason(isPastDue(task.due) || Boolean(task.overdueReason));
	  }, [task?.acceptanceCriteria, task?.attachments, task?.closureNotes, task?.customer, task?.dependencies, task?.description, task?.due, task?.id, task?.investigation, task?.overdueReason, task?.priority, task?.resolution, task?.severity, task?.subtasks, task?.tags, task?.ticketNumber, task?.title]);

  if (!task) return null;

	  const project = store.state.projects.find((item) => item.id === task.projectId);
	  const relatedTime = store.state.timeEntries.filter((entry) => entry.taskId === task.id);
	  const linkedFiles = store.state.files.filter((file) => file.linkedType === "Task" && file.linkedId === task.id);
	  const totalTrackedSeconds = task.actualMinutes * 60 + relatedTime.reduce((total, entry) => total + store.getTimerElapsed(entry), 0);
	  const checklistDone = task.checklist.filter((item) => item.done).length;
  const shouldShowOverdueReason = showOverdueReason || isPastDue(task.due) || Boolean(task.overdueReason);
	  const updateTaskPatch = (patch: Partial<Task>) => {
	    const nextTask = withDerivedTaskFields({ ...task, ...patch });
      if (taskRequiresOverdueReason(nextTask)) {
        setShowOverdueReason(true);
        setTaskUpdateError("Add an overdue reason before saving changes to this past-due task.");
        return;
      }
      setTaskUpdateError("");
      if (patch.overdueReason && patch.overdueReason.trim()) setShowOverdueReason(true);
	    if (onTaskUpdate) {
	      onTaskUpdate(task, nextTask);
    } else {
      store.updateTask(task.id, patch);
    }
  };
  const commitTitle = () => {
    const nextTitle = draftTitle.trim();
    if (nextTitle.length < 2) {
      setDraftTitle(task.title);
      return;
    }
    if (nextTitle !== task.title) updateTaskPatch({ title: nextTitle });
  };
  const commitDescription = () => {
    const nextDescription = draftDescription.trim();
    if (nextDescription !== task.description) updateTaskPatch({ description: nextDescription });
  };
  const commitTags = () => {
    const nextTags = splitLinesOrCommas(draftTags);
    if (nextTags.join("\n") !== task.tags.join("\n")) updateTaskPatch({ tags: nextTags });
  };
	  const addSubtask = () => {
	    const title = subtaskTitle.trim();
	    if (!title) return;
	    updateTaskPatch({
	      subtasks: [
	        ...task.subtasks,
	        { id: `subtask-${Math.random().toString(36).slice(2, 9)}`, title, status: "Todo", priority: subtaskPriority, due: subtaskDue || undefined }
	      ]
	    });
	    setSubtaskTitle("");
	  };
	  const updateSubtask = (subtaskId: string, patch: Partial<TaskSubtask>) => {
	    const nextSubtasks = task.subtasks.map((subtask) => (subtask.id === subtaskId ? { ...subtask, ...patch } : subtask));
	    updateTaskPatch({ subtasks: nextSubtasks });
	  };
	  const deleteSubtask = (subtaskId: string) => {
	    updateTaskPatch({ subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId) });
	  };
	  const uploadTaskFiles = async (files: FileList | null) => {
	    const selectedFiles = Array.from(files ?? []);
	    if (selectedFiles.length === 0) return;
	    setAttachmentUploading(true);
	    setAttachmentError("");
	    try {
	      for (const file of selectedFiles) {
	        if (onFileCreate) {
	          await onFileCreate({ name: file.name, type: file.type || "application/octet-stream", size: file.size, linkedType: "Task", linkedId: task.id }, file);
	        } else {
	          throw new Error("Task attachments require a signed-in workspace with file storage configured.");
	        }
	      }
	      updateTaskPatch({ attachments: uniqueStrings([...task.attachments, ...selectedFiles.map((file) => file.name)]) });
	    } catch (error) {
	      setAttachmentError(error instanceof Error ? error.message : "Task attachment upload failed.");
	    } finally {
	      setAttachmentUploading(false);
	    }
	  };
  const commitDependencies = () => {
    const nextDependencies = splitLines(draftDependencies);
    if (nextDependencies.join("\n") !== task.dependencies.join("\n")) updateTaskPatch({ dependencies: nextDependencies });
  };
  const commitAcceptanceCriteria = () => {
    const nextAcceptanceCriteria = draftAcceptanceCriteria.trim();
    if (nextAcceptanceCriteria !== task.acceptanceCriteria) updateTaskPatch({ acceptanceCriteria: nextAcceptanceCriteria });
  };
  const commitOverdueReason = () => {
    const nextReason = draftOverdueReason.trim();
    if (nextReason !== (task.overdueReason ?? "")) updateTaskPatch({ overdueReason: nextReason });
  };
  const commitTicketNumber = () => {
    const nextTicketNumber = draftTicketNumber.trim();
    if (nextTicketNumber !== (task.ticketNumber ?? "")) updateTaskPatch({ ticketNumber: nextTicketNumber });
  };
  const commitCustomer = () => {
    const nextCustomer = draftCustomer.trim();
    if (nextCustomer !== (task.customer ?? "")) updateTaskPatch({ customer: nextCustomer });
  };
  const commitInvestigation = () => {
    const nextInvestigation = draftInvestigation.trim();
    if (nextInvestigation !== (task.investigation ?? "")) updateTaskPatch({ investigation: nextInvestigation });
  };
  const commitResolution = () => {
    const nextResolution = draftResolution.trim();
    if (nextResolution !== (task.resolution ?? "")) updateTaskPatch({ resolution: nextResolution });
  };
  const commitClosureNotes = () => {
    const nextClosureNotes = draftClosureNotes.trim();
    if (nextClosureNotes !== (task.closureNotes ?? "")) updateTaskPatch({ closureNotes: nextClosureNotes });
  };

  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={(event) => handleModalKeyDown(event, onClose)} className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onMouseDown={onClose}>
      <motion.aside
        initial={{ x: 520 }}
        animate={{ x: 0 }}
        exit={{ x: 520 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge className={isTaskOverdue(task) ? "border-red-200 bg-red-100 text-red-800 dark:border-red-400/30 dark:bg-red-400/20 dark:text-red-100" : undefined}>{isTaskOverdue(task) ? "Overdue" : task.status}</Badge>
              <Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
              {task.workType === "Ticket" && <Badge className={severityClass(task.severity ?? "Medium")}>{task.severity ?? "Medium"}</Badge>}
              {task.recurringRule !== "None" && <Badge>{task.recurringRule}</Badge>}
              {project && <Badge>{project.name}</Badge>}
            </div>
            <h2 className="text-2xl font-semibold tracking-normal">{task.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.description}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldCard label="Schedule" value={`${formatDateLabel(task.startDate)} -> ${formatDateLabel(task.due)}`} />
	          <FieldCard label="Actual time spent" value={`${formatCompactDuration(totalTrackedSeconds)} worked (${formatCompactDuration(task.actualMinutes * 60)} manual + ${formatCompactDuration(relatedTime.reduce((total, entry) => total + store.getTimerElapsed(entry), 0))} tracked)`} />
	          <FieldCard label="Progress" value={`${calculateTaskProgress(task)}% complete`} />
          <FieldCard label="Related Project" value={project?.name ?? "No project"} />
        </div>

        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Task Details</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Edit the core task content and related metadata. Changes save when a field loses focus.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <LabeledField label="Title">
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={commitTitle}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </LabeledField>
            <LabeledField label="Description">
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                onBlur={commitDescription}
                className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
              />
            </LabeledField>
            <LabeledField label="Tags">
              <input
                value={draftTags}
                onChange={(event) => setDraftTags(event.target.value)}
                onBlur={commitTags}
                placeholder="Comma separated tags"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </LabeledField>
            <LabeledField label="Acceptance criteria">
              <textarea
                value={draftAcceptanceCriteria}
                onChange={(event) => setDraftAcceptanceCriteria(event.target.value)}
                onBlur={commitAcceptanceCriteria}
                placeholder="Definition of done"
                className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
              />
            </LabeledField>
          </CardContent>
        </Card>

        {task.workType === "Ticket" && (
          <Card className="mt-4">
            <CardHeader>
              <div>
                <CardTitle>Ticket Workflow</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Track customer context, investigation, resolution, and closure on the task itself.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={promotingArticle}
                onClick={async () => {
                  setPromotingArticle(true);
                  setPromoteError("");
                  try {
                    if (!onPromoteTicket) throw new Error("Promoting tickets requires a backend workspace.");
                    await onPromoteTicket(task);
                  } catch (error) {
                    setPromoteError(error instanceof Error ? error.message : "Could not promote ticket.");
                  } finally {
                    setPromotingArticle(false);
                  }
                }}
              >
                {promotingArticle ? "Promoting..." : "Promote to article"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {promoteError && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">{promoteError}</p>}
              <div className="grid gap-4 sm:grid-cols-3">
                <LabeledField label="Ticket number">
                  <input value={draftTicketNumber} onChange={(event) => setDraftTicketNumber(event.target.value)} onBlur={commitTicketNumber} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                </LabeledField>
                <LabeledField label="Customer">
                  <input value={draftCustomer} onChange={(event) => setDraftCustomer(event.target.value)} onBlur={commitCustomer} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                </LabeledField>
                <LabeledField label="Severity">
                  <select
                    value={draftSeverity}
                    onChange={(event) => {
                      const nextSeverity = event.target.value as TicketSeverity;
                      setDraftSeverity(nextSeverity);
                      updateTaskPatch({ severity: nextSeverity });
                    }}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {(["Low", "Medium", "High", "Critical"] as TicketSeverity[]).map((severity) => <option key={severity}>{severity}</option>)}
                  </select>
                </LabeledField>
              </div>
              <LabeledField label="Investigation">
                <textarea value={draftInvestigation} onChange={(event) => setDraftInvestigation(event.target.value)} onBlur={commitInvestigation} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" />
              </LabeledField>
              <LabeledField label="Resolution">
                <textarea value={draftResolution} onChange={(event) => setDraftResolution(event.target.value)} onBlur={commitResolution} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" />
              </LabeledField>
              <LabeledField label="Closure notes">
                <textarea value={draftClosureNotes} onChange={(event) => setDraftClosureNotes(event.target.value)} onBlur={commitClosureNotes} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" />
              </LabeledField>
            </CardContent>
          </Card>
        )}

        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Update Task</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Change the task status, priority, dates, and measured progress.</p>
            </div>
          </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
            {taskUpdateError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100 sm:col-span-2">{taskUpdateError}</div>}
            {shouldShowOverdueReason && (
              <LabeledField label="Overdue reason" className="sm:col-span-2">
                <textarea
                  value={draftOverdueReason}
                  onChange={(event) => setDraftOverdueReason(event.target.value)}
                  onBlur={commitOverdueReason}
                  placeholder="Explain why this task passed its due date and what will happen next."
                  className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
                />
              </LabeledField>
            )}
            <LabeledField label="Status">
              <select
                value={task.status}
                onChange={(event) => {
                  const nextStatus = event.target.value as TaskStatus;
                  const nextTask = withDerivedTaskFields({ ...task, status: nextStatus });
                  if (taskRequiresOverdueReason(nextTask)) {
                    setShowOverdueReason(true);
                    setTaskUpdateError("Add an overdue reason before changing the status of this past-due task.");
                    return;
                  }
                  setTaskUpdateError("");
                  if (onTaskStatusChange) {
                    onTaskStatusChange(task.id, nextStatus, task.status);
                  } else {
                    store.setTaskStatus(task.id, nextStatus);
                  }
                }}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                {taskStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Priority">
              <select value={task.priority} onChange={(event) => updateTaskPatch({ priority: event.target.value as Priority })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {priorities.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Project">
              <select value={task.projectId ?? ""} onChange={(event) => updateTaskPatch({ projectId: event.target.value || undefined })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">No project</option>
                {store.state.projects.filter((project) => !project.archived).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Repeats">
              <select value={task.recurringRule} onChange={(event) => updateTaskPatch({ recurringRule: event.target.value as RecurrenceRule })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {recurrenceRules.map((rule) => <option key={rule}>{rule}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Start date">
              <input type="date" value={task.startDate} onChange={(event) => updateTaskPatch({ startDate: event.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
            <LabeledField label="Due date">
              <input type="date" value={task.due === "TBD" ? "" : task.due} onChange={(event) => updateTaskPatch({ due: event.target.value || "TBD" })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
	            <LabeledField label="Progress percent">
	              <input value={calculateTaskProgress(task)} disabled={task.subtasks.length > 0} onChange={(event) => updateTaskPatch({ progress: clampNumber(event.target.value, 0, 100) })} inputMode="numeric" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60" />
	              {task.subtasks.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Calculated from child task completion.</p>}
	            </LabeledField>
            <LabeledField label="Manual time adjustment, minutes">
              <input value={task.actualMinutes} onChange={(event) => updateTaskPatch({ actualMinutes: clampNumber(event.target.value, 0, 100000) })} inputMode="numeric" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </LabeledField>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
            <Badge>{checklistDone}/{task.checklist.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {task.checklist.length === 0 && <p className="text-sm text-muted-foreground">No checklist items yet.</p>}
            {task.checklist.map((item) => (
              <label key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => updateTaskPatch({ checklist: task.checklist.map((checklistItem) => (checklistItem.id === item.id ? { ...checklistItem, done: !checklistItem.done } : checklistItem)) })}
                />
                <span className={cn(item.done && "text-muted-foreground line-through")}>{item.label}</span>
              </label>
            ))}
          </CardContent>
        </Card>

        <div className="mt-4 space-y-4">
	          <Card>
	            <CardHeader>
	              <CardTitle>Child Tasks</CardTitle>
	              <Badge>{task.subtasks.filter((subtask) => subtask.status === "Done").length}/{task.subtasks.length}</Badge>
	            </CardHeader>
	            <CardContent className="space-y-4">
	              <div className="space-y-2">
	                {task.subtasks.length === 0 && <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">No child tasks yet. Add one below to track parent progress.</p>}
	                {task.subtasks.map((subtask) => (
	                  <div key={subtask.id} className="rounded-lg border border-border bg-background p-3">
	                    <div className="space-y-2">
	                      <input value={subtask.title} onChange={(event) => updateSubtask(subtask.id, { title: event.target.value })} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm" />
	                      <select value={subtask.status} onChange={(event) => updateSubtask(subtask.id, { status: event.target.value as TaskStatus })} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm">
	                        {taskStatuses.map((status) => <option key={status}>{status}</option>)}
	                      </select>
	                      <select value={subtask.priority} onChange={(event) => updateSubtask(subtask.id, { priority: event.target.value as Priority })} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm">
	                        {priorities.map((priority) => <option key={priority}>{priority}</option>)}
	                      </select>
	                    </div>
	                    <div className="mt-2 space-y-2">
	                      <input type="date" value={subtask.due ?? ""} onChange={(event) => updateSubtask(subtask.id, { due: event.target.value || undefined })} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm" />
	                      <Button type="button" variant="ghost" size="sm" onClick={() => deleteSubtask(subtask.id)}>Remove</Button>
	                    </div>
	                  </div>
	                ))}
	              </div>
	              <div className="rounded-lg border border-border bg-secondary/20 p-3">
	                <div className="space-y-2">
	                  <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="New child task title" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
	                  <input type="date" value={subtaskDue} onChange={(event) => setSubtaskDue(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
	                  <select value={subtaskPriority} onChange={(event) => setSubtaskPriority(event.target.value as Priority)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
	                    {priorities.map((priority) => <option key={priority}>{priority}</option>)}
	                  </select>
	                </div>
	                <Button type="button" className="mt-3" size="sm" onClick={addSubtask}>Add child task</Button>
	              </div>
	            </CardContent>
	          </Card>
	          <Card>
	            <CardHeader>
	              <CardTitle>Related Task Context</CardTitle>
	            </CardHeader>
	            <CardContent className="space-y-4">
	              <LabeledField label="Dependencies">
                <textarea
                  value={draftDependencies}
                  onChange={(event) => setDraftDependencies(event.target.value)}
                  onBlur={commitDependencies}
                  placeholder="One dependency per line"
                  className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
                />
              </LabeledField>
	              <LabeledField label="Attachments">
	                <input type="file" multiple disabled={attachmentUploading} onChange={(event) => {
	                  void uploadTaskFiles(event.target.files);
	                  event.target.value = "";
	                }} className="w-full rounded-lg border border-border bg-background p-3 text-sm" />
	                <p className="mt-1 text-xs text-muted-foreground">{attachmentUploading ? "Uploading files..." : "Attach any file type to this task. Files are stored in workspace storage."}</p>
	                {attachmentError && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">{attachmentError}</p>}
	              </LabeledField>
	              <div className="space-y-2">
	                {linkedFiles.length === 0 && task.attachments.length === 0 && <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">No attached files yet.</p>}
	                {linkedFiles.map((file) => (
	                  <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm">
	                    <span className="min-w-0 flex-1 break-all">{file.name}</span>
	                    <Button type="button" variant="outline" size="sm" onClick={() => downloadFileAsset(file)}>Download</Button>
	                  </div>
	                ))}
	                {task.attachments.filter((attachment) => !linkedFiles.some((file) => file.name === attachment)).map((attachment) => (
	                  <div key={attachment} className="break-all rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">{attachment}</div>
	                ))}
	              </div>
            </CardContent>
          </Card>
          <InfoList title="Tracked Time" items={relatedTime.map((entry) => `${entry.title} - ${formatSeconds(store.getTimerElapsed(entry))} - ${formatTimestamp(entry.startedAt)} - ${entry.status}`)} empty="No tracked time linked." />
        </div>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Task Notes</CardTitle>
            <Badge>{task.notes.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              data-testid="task-note-input"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Add progress, investigation notes, decisions, blockers, or handoff context..."
              className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button
              data-testid="add-task-note"
              onClick={() => {
                const trimmedNote = noteBody.trim();
                if (!trimmedNote) return;
                updateTaskPatch({
                  notes: [
                    { id: `task-note-${Math.random().toString(36).slice(2, 9)}`, body: trimmedNote, createdAt: new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) },
                    ...task.notes
                  ]
                });
                setNoteBody("");
              }}
            >
              Add note
            </Button>
            <div className="space-y-3">
              {task.notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-border bg-background p-3">
                  <p className="mb-2 text-xs text-muted-foreground">{note.createdAt}</p>
                  <p className="whitespace-pre-wrap text-sm leading-6">{note.body}</p>
                </div>
              ))}
              {task.notes.length === 0 && <p className="text-sm text-muted-foreground">No task notes yet.</p>}
            </div>
          </CardContent>
        </Card>
      </motion.aside>
    </div>
  );
}

function TimerCard({ store, onStart, onToggle, onStop }: { store: ReturnType<typeof useWorkspaceStore>; onStart?: (title: string, taskId?: string) => Promise<void>; onToggle?: (timerId: string) => Promise<void>; onStop?: (timerId: string) => Promise<void> }) {
  const timer = store.metrics.runningTimer;
  const [taskId, setTaskId] = useState("");
  const selectedTask = store.state.tasks.find((task) => task.id === taskId);
  const timerTitle = selectedTask ? `Focus: ${selectedTask.title}` : "Focused work";
  return (
    <Card>
      <CardHeader><CardTitle>Running Timer</CardTitle><Badge>{timer?.status ?? "Idle"}</Badge></CardHeader>
      <CardContent>
        {timer ? (
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">{timer.title}</p>
            <div className="my-5 text-4xl font-semibold tracking-normal">{formatSeconds(store.getTimerElapsed(timer))}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { void onToggle?.(timer.id); }}>{timer.status === "Running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{timer.status === "Running" ? "Pause" : "Resume"}</Button>
              <Button variant="outline" size="sm" onClick={() => { void onStop?.(timer.id); }}><Square className="h-4 w-4" />Stop</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">No linked task</option>
              {store.state.tasks.filter((task) => task.status !== "Done").map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            <Button variant="outline" className="w-full" onClick={() => { void onStart?.(timerTitle, taskId || undefined); }}>Start focus timer</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgendaCard({ store }: { store: ReturnType<typeof useWorkspaceStore> }) {
  return (
    <Card>
      <CardHeader><CardTitle>Calendar</CardTitle><CalendarDays className="h-4 w-4 text-muted-foreground" /></CardHeader>
      <CardContent className="space-y-3">
        {store.state.events.map((event) => <div key={event.id} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">{event.start} {event.title}</div>)}
      </CardContent>
    </Card>
  );
}

function AiCard({ store, onGenerateAiDraft }: { store: ReturnType<typeof useWorkspaceStore>; onGenerateAiDraft?: (prompt: string) => Promise<string> }) {
  const [prompt, setPrompt] = useState("Prioritize my day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const workflowPrompts = [
    { label: "Note summary", prompt: "Summarize my recent notes into key decisions, blockers, and next actions." },
    { label: "Ticket summary", prompt: "Summarize open ticket work with customer impact, severity, investigation status, and next action." },
    { label: "Explain SQL", prompt: "Explain the most relevant SQL snippets, their purpose, risk, and when to use them." },
    { label: "Draft RCA", prompt: "Generate a professional RCA from current ticket and task context with problem, root cause, resolution, and prevention." },
    { label: "Draft email", prompt: "Draft a concise professional status email based on current tasks, tickets, blockers, and deadlines." }
  ];

  async function generate(nextPrompt: string) {
    setPrompt(nextPrompt);
    setLoading(true);
    setError("");
    try {
      if (!onGenerateAiDraft) throw new Error("AI generation requires a backend workspace.");
      await onGenerateAiDraft(nextPrompt);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "AI generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>AI Assistant</CardTitle><Sparkles className="h-4 w-4 text-primary" /></CardHeader>
      <CardContent className="space-y-3">
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          {workflowPrompts.map((workflow) => (
            <Button key={workflow.label} variant="outline" size="sm" disabled={loading} onClick={() => void generate(workflow.prompt)}>
              {workflow.label}
            </Button>
          ))}
        </div>
        <Button className="w-full" disabled={loading} onClick={() => void generate(prompt)}>{loading ? "Generating..." : "Generate draft"}</Button>
        {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {store.state.aiDraft && <AiDraftView content={store.state.aiDraft} />}
      </CardContent>
    </Card>
  );
}

function AiDraftView({ content }: { content: string }) {
  const sections = parseAiSections(content);
  return (
    <div className="max-h-96 space-y-3 overflow-auto rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 rounded-lg border border-primary/10 bg-primary/5 px-3 py-2 text-sm text-primary">
        <Sparkles className="h-4 w-4" />
        <span className="font-medium">Generated workspace answer</span>
      </div>
      {sections.map((section, index) => {
        return (
          <div key={`${section.heading}-${index}`} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            {section.heading && <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{cleanAiMarkdown(section.heading)}</p>}
            <div className={cn("space-y-2 text-sm leading-6", section.heading && "mt-3")}>
              {section.lines.map((line, lineIndex) => <AiDraftLine key={`${line}-${lineIndex}`} line={line} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AiDraftLine({ line }: { line: string }) {
  const trimmed = line.trim();
  const bullet = trimmed.match(/^[-*]\s+(.+)$/);
  const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
  const task = trimmed.match(/^\[(x| )]\s+(.+)$/i);
  const value = cleanAiMarkdown(task?.[2] ?? bullet?.[1] ?? numbered?.[1] ?? trimmed);

  if (bullet || numbered || task) {
    return (
      <div className="flex gap-2 rounded-md bg-secondary/40 px-2.5 py-2">
        <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", task?.[1]?.toLowerCase() === "x" ? "text-emerald-500" : "text-primary")} />
        <p className="min-w-0 whitespace-pre-wrap text-muted-foreground">{value}</p>
      </div>
    );
  }

  if (trimmed.startsWith("```")) return null;
  return <p className="whitespace-pre-wrap text-muted-foreground">{value}</p>;
}

function parseAiSections(content: string) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } = { heading: "", lines: [] };

  for (const line of lines) {
    const normalized = cleanAiMarkdown(line).replace(/:$/, "");
    const looksLikeHeading = line.endsWith(":") || (/^#{1,3}\s+/.test(line) && normalized.length <= 60) || (normalized.length <= 34 && !/^[-*\d]/.test(normalized));
    if (looksLikeHeading && current.lines.length > 0) {
      sections.push(current);
      current = { heading: normalized, lines: [] };
      continue;
    }
    if (looksLikeHeading && !current.heading && current.lines.length === 0) {
      current.heading = normalized;
      continue;
    }
    current.lines.push(line);
  }

  if (current.heading || current.lines.length) sections.push(current);
  return sections.length ? sections : [{ heading: "Response", lines: [content] }];
}

function cleanAiMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function RecentNotesCard({ store, onOpenNote }: { store: ReturnType<typeof useWorkspaceStore>; onOpenNote?: (noteId: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Recent Notes</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader>
      <CardContent className="space-y-3">
        {store.state.notes.slice(0, 4).map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => onOpenNote?.(note.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{note.title}</span>
            {note.pinned && <Badge>Pinned</Badge>}
          </button>
        ))}
        {store.state.notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
      </CardContent>
    </Card>
  );
}

function RecentFilesCard({ store, onOpenFile }: { store: ReturnType<typeof useWorkspaceStore>; onOpenFile?: (fileId: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Recent Files</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader>
      <CardContent className="space-y-3">
        {store.state.files.slice(0, 4).map((file) => (
          <button
            key={file.id}
            type="button"
            onClick={() => onOpenFile?.(file.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{file.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{file.linkedType} - {formatFileSize(file.size)}</span>
            </span>
          </button>
        ))}
        {store.state.files.length === 0 && <p className="text-sm text-muted-foreground">No files linked yet.</p>}
      </CardContent>
    </Card>
  );
}

function ModuleHeader({
  title,
  description,
  icon: Icon,
  action,
  onAction,
  rightSlot
}: {
  title: string;
  description: string;
  icon: typeof Workflow;
  action?: string;
  onAction?: () => void;
  rightSlot?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rightSlot}
          {action && <Button onClick={onAction}><Plus className="h-4 w-4" />{action}</Button>}
        </div>
      </div>
    </section>
  );
}

function ModuleList({ title, icon, action, onAction, items }: { title: string; icon: typeof Workflow; action: string; onAction: () => void; items: { type: string; title: string; meta: string }[] }) {
  return (
    <div className="space-y-6">
      <ModuleHeader title={title} description="A triage queue for uncategorized work and open loops." icon={icon} action={action} onAction={onAction} />
      <Card>
        <CardContent className="space-y-3 p-5">
          {items.map((item) => <div key={`${item.type}-${item.title}`} className="flex items-center justify-between rounded-xl border border-border bg-background p-4"><div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.type}</p></div><Badge>{item.meta}</Badge></div>)}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, detail, icon: Icon, tone, onClick }: { title: string; value: string; detail: string; icon: typeof Workflow; tone: string; onClick?: () => void }) {
  const toneMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200"
  };
  return (
    <Card className={cn("transition hover:-translate-y-0.5 hover:shadow-soft", onClick && "cursor-pointer")} onClick={onClick}>
      <CardContent className="flex items-center gap-4 p-5">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", toneMap[tone])}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
      </CardContent>
    </Card>
  );
}

function TaskHealthPill({ label, value, icon: Icon, tone, onClick }: { label: string; value: number; icon: typeof Workflow; tone: "amber" | "blue" | "red"; onClick?: () => void }) {
  const toneMap = {
    amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100",
    blue: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100",
    red: "border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100"
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center justify-between rounded-xl border px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft", toneMap[tone])}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm font-medium">{label}</span>
      </span>
      <span className="ml-3 text-xl font-semibold tracking-normal">{value}</span>
    </button>
  );
}

function ChartKey({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function getProjectProgress(project: Project, tasks: Task[]) {
  if (tasks.length === 0) return project.progress;
  return Math.round((tasks.filter((task) => task.status === "Done").length / tasks.length) * 100);
}

function FieldCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function LabeledField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function formatAiErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not generate summary.";
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("ai provider rejected") || lowerMessage.includes("ai provider network") || lowerMessage.includes("ai provider returned")) {
    return message;
  }
  if (lowerMessage.includes("ai provider is not configured") || lowerMessage.includes("503") || lowerMessage.includes("request failed")) {
    return "AI is not available right now. Configure the AI provider in the server environment, then try again.";
  }
  return message;
}

function InfoList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">{item}</div>
        ))}
      </CardContent>
    </Card>
  );
}

function DocBlock({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><p>{value}</p></div>;
}

type ArticleRelations = {
  tasks: Task[];
  tickets: Task[];
  sql: WorkspaceState["sqlSnippets"];
  notes: WorkspaceState["notes"];
  files: WorkspaceState["files"];
  references: string[];
};

function ArticleRelationsPanel({
  relations,
  onOpenTask,
  onOpenNote,
  onOpenSql,
  onOpenFile,
  onEditArticle
}: {
  relations: ArticleRelations;
  onOpenTask: (taskId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenSql: (snippetId: string) => void;
  onOpenFile: (fileId: string) => void;
  onEditArticle: () => void;
}) {
  const hasRelations = relations.tasks.length || relations.tickets.length || relations.sql.length || relations.notes.length || relations.files.length || relations.references.length;
  if (!hasRelations) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
        No related context linked yet. Add task, ticket, SQL, note, or file references in the article editor to turn this into a connected knowledge hub.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Related records</p>
          <p className="mt-1 text-xs text-muted-foreground">Open and edit connected tasks, tickets, SQL, notes, files, and manual references from this article.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onEditArticle}>Edit links</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RelationGroup label="Tasks" items={relations.tasks.map((task) => ({ id: task.id, title: task.title, meta: `${task.status} - ${task.priority}`, actionLabel: "Open task" }))} onOpen={onOpenTask} />
        <RelationGroup label="Tickets" items={relations.tickets.map((ticket) => ({ id: ticket.id, title: ticket.ticketNumber ? `${ticket.ticketNumber} - ${ticket.title}` : ticket.title, meta: `${ticket.customer ?? "Internal"} - ${ticket.status}`, actionLabel: "Open ticket" }))} onOpen={onOpenTask} />
        <RelationGroup label="SQL" items={relations.sql.map((snippet) => ({ id: snippet.id, title: snippet.title, meta: `${snippet.folder} - ${snippet.tags.join(", ") || "No tags"}`, actionLabel: "Edit SQL" }))} onOpen={onOpenSql} />
        <RelationGroup label="Notes" items={relations.notes.map((note) => ({ id: note.id, title: note.title, meta: `${note.updatedAt} - ${note.tags.join(", ") || "No tags"}`, actionLabel: "Edit note" }))} onOpen={onOpenNote} />
        <RelationGroup label="Files" items={relations.files.map((file) => ({ id: file.id, title: file.name, meta: `${file.linkedType} - ${formatFileSize(file.size)}`, actionLabel: "Open file" }))} onOpen={onOpenFile} />
        <RelationGroup label="References" items={relations.references.map((reference) => ({ id: reference, title: reference, meta: "Manual link" }))} />
      </div>
    </div>
  );
}

function RelationGroup({ label, items, onOpen }: { label: string; items: Array<{ id: string; title: string; meta?: string; actionLabel?: string }>; onOpen?: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <Badge>{items.length}</Badge>
      </div>
      <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={!onOpen}
            onClick={() => onOpen?.(item.id)}
            className="w-full rounded-lg border border-border bg-card p-2 text-left transition enabled:hover:border-primary/40 enabled:hover:bg-secondary disabled:cursor-default"
          >
            <p className="break-words text-sm font-medium">{item.title}</p>
            {item.meta && <p className="mt-1 break-words text-xs text-muted-foreground">{item.meta}</p>}
            {onOpen && <p className="mt-2 text-xs font-medium text-primary">{item.actionLabel ?? "Open"}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function getArticleLinkOptions(store: ReturnType<typeof useWorkspaceStore>, linkType: "Task" | "Ticket" | "SQL" | "Note" | "File") {
  if (linkType === "Task") {
    return store.state.tasks
      .filter((task) => task.workType !== "Ticket")
      .map((task) => ({ id: task.id, label: task.title }));
  }
  if (linkType === "Ticket") {
    return store.state.tasks
      .filter((task) => task.workType === "Ticket")
      .map((task) => ({ id: task.id, label: task.ticketNumber ? `${task.ticketNumber} - ${task.title}` : task.title }));
  }
  if (linkType === "SQL") return store.state.sqlSnippets.map((snippet) => ({ id: snippet.id, label: snippet.title }));
  if (linkType === "Note") return store.state.notes.map((note) => ({ id: note.id, label: note.title }));
  return store.state.files.map((file) => ({ id: file.id, label: file.name }));
}

function modeButtonClass(active: boolean) {
  return cn(
    "h-8 rounded-md px-3 text-xs font-medium transition",
    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
  );
}

function splitLines(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createSubtasksFromText(value: string, due: string, priority: Priority): TaskSubtask[] {
  return splitLines(value).map((title) => ({
    id: `subtask-${Math.random().toString(36).slice(2, 9)}`,
    title,
    status: "Todo",
    priority,
    due: due || undefined
  }));
}

function calculateTaskProgress(task: Pick<Task, "status" | "progress" | "subtasks">) {
  if (task.subtasks.length > 0) {
    return Math.round((task.subtasks.filter((subtask) => subtask.status === "Done").length / task.subtasks.length) * 100);
  }
  if (task.status === "Done") return 100;
  return task.progress >= 100 ? 0 : task.progress;
}

function withDerivedTaskFields(task: Task): Task {
  const progress = calculateTaskProgress(task);
  return { ...task, progress };
}

function formatTicketTaskTitle(workspaceName: string, ticketNumber: string, title: string) {
  const workspaceCode = workspaceName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase() || "NW";
  const cleanNumber = ticketNumber.replace(new RegExp(`^${workspaceCode}-`, "i"), "").replace(/^NX-/i, "").trim();
  const normalizedTitle = title.replace(new RegExp(`^${workspaceCode}-[^:]+:\\s*`, "i"), "").trim();
  return `${workspaceCode}-${cleanNumber}: ${normalizedTitle || "Untitled ticket"}`;
}

function splitLinesOrCommas(value: string) {
  return value
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getProjectNotes(project: Project, state: WorkspaceState) {
  const projectTerms = [project.id, project.name, ...project.name.split(/\s+/)].map(normalizeSearchText).filter((item) => item.length > 2);
  return state.notes.filter((note) => {
    if (note.projectId === project.id) return true;
    const noteText = normalizeSearchText([note.title, note.content, ...note.tags].join(" "));
    return projectTerms.some((term) => noteText.includes(term));
  });
}

function getProjectActivity(project: Project, tasks: Task[], notes: WorkspaceState["notes"], files: string[]) {
  return [
    ...project.milestones.map((milestone) => ({
      id: `milestone-${milestone.id}`,
      title: milestone.completed ? `Completed milestone: ${milestone.title}` : `Milestone planned: ${milestone.title}`,
      meta: `Due ${milestone.due}`
    })),
    ...tasks.map((task) => ({
      id: `task-${task.id}`,
      title: `${task.title} is ${task.status}`,
      meta: `${task.priority} priority - ${task.progress}% complete`
    })),
    ...notes.map((note) => ({
      id: `note-${note.id}`,
      title: `Updated note: ${note.title}`,
      meta: note.updatedAt
    })),
    ...files.map((file) => ({
      id: `file-${file}`,
      title: `Linked file: ${file}`,
      meta: project.name
    }))
  ].slice(0, 10);
}

function getArticleRelations(article: KnowledgeArticle, state: WorkspaceState): ArticleRelations {
  const articleText = [
    article.title,
    article.problem,
    article.rootCause,
    article.resolution,
    ...article.tags,
    ...article.references
  ].join(" ");

  const tasks = state.tasks
    .filter((task) => task.workType !== "Ticket" && entityMatchesArticle(article, articleText, task.id, task.title, task.tags))
    .slice(0, 6);
  const tickets = state.tasks
    .filter((task) => task.workType === "Ticket" && entityMatchesArticle(article, articleText, task.id, task.title, task.tags, [task.ticketNumber, task.customer]))
    .slice(0, 6);
  const sql = state.sqlSnippets
    .filter((snippet) => entityMatchesArticle(article, articleText, snippet.id, snippet.title, snippet.tags, [snippet.folder, snippet.description]))
    .slice(0, 6);
  const notes = state.notes
    .filter((note) => entityMatchesArticle(article, articleText, note.id, note.title, note.tags))
    .slice(0, 6);
  const fileReferences = uniqueStrings([
    ...article.references.filter((reference) => looksLikeFileReference(reference)).map(cleanReferenceLabel),
    ...tasks.flatMap((task) => task.attachments),
    ...tickets.flatMap((task) => task.attachments)
  ]);
  const files = state.files
    .filter((file) => {
      const fileText = normalizeSearchText(`${file.id} ${file.name} ${file.linkedType} ${file.linkedId ?? ""}`);
      return fileReferences.some((reference) => fileText.includes(normalizeSearchText(reference))) || normalizedIncludes(articleText, file.name);
    })
    .slice(0, 12);
  const unmatchedFileReferences = fileReferences.filter((reference) => !files.some((file) => normalizedIncludes(`${file.id} ${file.name}`, reference)));
  const references = [
    ...article.references
    .filter((reference) => !looksLikeTypedEntityReference(reference))
      .filter((reference) => !looksLikeFileReference(reference)),
    ...unmatchedFileReferences.map((reference) => `File reference: ${reference}`)
  ];

  return { tasks, tickets, sql, notes, files, references };
}

function articleMatchesKnowledgeQuery(article: KnowledgeArticle, relations: ArticleRelations, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const relationText = [
    ...relations.tasks.map((task) => `${task.title} ${task.description} ${task.tags.join(" ")} ${task.attachments.join(" ")}`),
    ...relations.tickets.map((ticket) => `${ticket.ticketNumber ?? ""} ${ticket.title} ${ticket.customer ?? ""} ${ticket.investigation ?? ""}`),
    ...relations.sql.map((snippet) => `${snippet.title} ${snippet.description} ${snippet.folder} ${snippet.tags.join(" ")}`),
    ...relations.notes.map((note) => `${note.title} ${note.content} ${note.tags.join(" ")}`),
    ...relations.files.map((file) => `${file.name} ${file.type} ${file.linkedType}`),
    ...relations.references
  ].join(" ");
  const searchable = normalizeSearchText([
    article.title,
    article.problem,
    article.rootCause,
    article.resolution,
    article.tags.join(" "),
    article.references.join(" "),
    relationText
  ].join(" "));
  return normalizedQuery.split(/\s+/).every((part) => searchable.includes(part));
}

function entityMatchesArticle(article: KnowledgeArticle, articleText: string, id: string, title: string, tags: string[] = [], aliases: Array<string | undefined> = []) {
  const normalizedText = normalizeSearchText(articleText);
  const articleReferences = article.references.map(normalizeSearchText);
  const identifiers = [id, title, ...aliases].filter(Boolean).map((value) => normalizeSearchText(value as string));
  if (identifiers.some((identifier) => identifier && (articleReferences.some((reference) => reference.includes(identifier)) || normalizedText.includes(identifier)))) return true;

  const meaningfulArticleTags = article.tags.map(normalizeSearchText).filter(isMeaningfulRelationTag);
  const meaningfulEntityTags = tags.map(normalizeSearchText).filter(isMeaningfulRelationTag);
  return meaningfulArticleTags.some((tag) => meaningfulEntityTags.includes(tag));
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedIncludes(haystack: string, needle: string) {
  const normalizedNeedle = normalizeSearchText(needle);
  return Boolean(normalizedNeedle) && normalizeSearchText(haystack).includes(normalizedNeedle);
}

function isMeaningfulRelationTag(tag: string) {
  return tag.length > 2 && !["task", "ticket", "knowledge", "documentation", "note", "sql"].includes(tag);
}

function looksLikeFileReference(reference: string) {
  const normalized = reference.trim().toLowerCase();
  return normalized.startsWith("file:") || /\.[a-z0-9]{2,8}($|\s)/i.test(reference);
}

function looksLikeTypedEntityReference(reference: string) {
  return /^(task|ticket|sql|note|file|customer):/i.test(reference.trim());
}

function cleanReferenceLabel(reference: string) {
  return reference.replace(/^(task|ticket|sql|note|file|customer):\s*/i, "").trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clampNumber(value: string, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function todayInputDate() {
  return toDateKey(new Date());
}

function createNextRecurringTaskInput(task: Task): CreateTaskInput {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    priority: task.priority,
    startDate: shiftRecurringDate(task.startDate, task.recurringRule),
    due: shiftRecurringDate(task.due, task.recurringRule),
    estimateMinutes: task.estimateMinutes,
    acceptanceCriteria: task.acceptanceCriteria,
    tags: task.tags,
    checklist: task.checklist.map((item) => ({ ...item, id: `check-${Math.random().toString(36).slice(2, 9)}`, done: false })),
    subtasks: task.subtasks,
    dependencies: task.dependencies,
    recurringRule: task.recurringRule
  };
}

function createArticleFromTicketTask(task: Task): CreateArticleInput {
  const ticketLabel = task.ticketNumber ? `${task.ticketNumber} - ` : "";
  const resolution = task.resolution || task.closureNotes || task.acceptanceCriteria || "Resolution to be documented.";
  const rootCause = task.investigation || "Root cause to be documented.";
  const references = [
    `Task: ${task.title}`,
    task.ticketNumber ? `Ticket: ${task.ticketNumber}` : "",
    task.customer ? `Customer: ${task.customer}` : ""
  ].filter(Boolean);

  return {
    title: `${ticketLabel}${task.title}`,
    problem: task.description || task.title,
    rootCause,
    resolution,
    tags: Array.from(new Set(["ticket", "knowledge", ...task.tags])),
    references
  };
}

function findArticleForTicketTask(articles: KnowledgeArticle[], task: Task) {
  const identifiers = [
    task.id,
    task.title,
    task.ticketNumber,
    task.ticketNumber ? `${task.ticketNumber} - ${task.title}` : undefined
  ].filter(Boolean).map((value) => normalizeSearchText(value as string));

  return articles.find((article) => {
    const searchable = normalizeSearchText([article.title, article.problem, article.references.join(" ")].join(" "));
    return identifiers.some((identifier) => identifier && searchable.includes(identifier));
  });
}

function buildKnowledgeAiPrompt(article: KnowledgeArticle, relations: ArticleRelations) {
  const relationSummary = [
    `Article: ${article.title}`,
    `Problem: ${article.problem}`,
    `Root cause: ${article.rootCause}`,
    `Resolution: ${article.resolution}`,
    `Tags: ${article.tags.join(", ") || "none"}`,
    "",
    "Related tasks:",
    ...(relations.tasks.length ? relations.tasks.map((task) => `- ${task.title} (${task.status}, ${task.priority}, due ${task.due}): ${task.description}`) : ["- none"]),
    "",
    "Related tickets:",
    ...(relations.tickets.length ? relations.tickets.map((ticket) => `- ${ticket.ticketNumber ?? "Ticket"} ${ticket.title} (${ticket.status}, ${ticket.severity ?? "Medium"}): ${ticket.investigation || ticket.description}`) : ["- none"]),
    "",
    "Related SQL:",
    ...(relations.sql.length ? relations.sql.map((snippet) => `- ${snippet.title} [${snippet.folder}]: ${snippet.description}. SQL: ${snippet.query.slice(0, 500)}`) : ["- none"]),
    "",
    "Related notes:",
    ...(relations.notes.length ? relations.notes.map((note) => `- ${note.title}: ${note.content.slice(0, 500)}`) : ["- none"]),
    "",
    "Related files:",
    ...(relations.files.length ? relations.files.map((file) => `- ${file.name} (${file.type}, ${formatFileSize(file.size)})`) : ["- none"]),
    "",
    "Manual references:",
    ...(relations.references.length ? relations.references.map((reference) => `- ${reference}`) : ["- none"])
  ].join("\n");

  return `Analyze this knowledge article as the central source of truth. Identify missing context, contradictions, related work to inspect, likely next actions, and documentation improvements.\n\n${relationSummary}`;
}

function shiftRecurringDate(value: string, rule: RecurrenceRule) {
  const date = parseTaskDate(value);
  if (!date || rule === "None") return value;
  if (rule === "Daily") date.setDate(date.getDate() + 1);
  if (rule === "Weekly") date.setDate(date.getDate() + 7);
  if (rule === "Monthly") date.setMonth(date.getMonth() + 1);
  return toDateKey(date);
}

function formatDateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parseTaskDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskDateKey(value: string) {
  const date = parseTaskDate(value);
  return date ? toDateKey(date) : "";
}

function getCurrentWeekRange(reference = new Date()) {
  const start = toDateOnly(reference);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function getCurrentMonthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  return { start, end };
}

function getCurrentQuarterRange(reference = new Date()) {
  const quarterStartMonth = Math.floor(reference.getMonth() / 3) * 3;
  const start = new Date(reference.getFullYear(), quarterStartMonth, 1);
  const end = new Date(reference.getFullYear(), quarterStartMonth + 3, 1);
  return { start, end };
}

function getAnalyticsRange(mode: AnalyticsRangeMode) {
  if (mode === "week") return getCurrentWeekRange();
  if (mode === "month") return getCurrentMonthRange();
  if (mode === "quarter") return getCurrentQuarterRange();
  return null;
}

function getTasksInRange(tasks: Task[], range: { start: Date; end: Date } | null) {
  if (!range) return tasks;
  return tasks.filter((task) => {
    const dueDate = parseTaskDate(task.due);
    const startDate = parseTaskDate(task.startDate);
    const updatedDate = task.updatedAt ? new Date(task.updatedAt) : null;
    return [dueDate, startDate, updatedDate].some((date) => date && date >= range.start && date < range.end);
  });
}

function getTasksDueInRange(tasks: Task[], range: { start: Date; end: Date } | null) {
  return tasks.filter((task) => {
    const dueDate = parseTaskDate(task.due);
    if (!dueDate) return false;
    return range ? dueDate >= range.start && dueDate < range.end : true;
  });
}

function buildAnalyticsChartData(tasks: Task[], store: ReturnType<typeof useWorkspaceStore>, mode: AnalyticsRangeMode) {
  const buckets = getAnalyticsBuckets(mode);
  return buckets.map((bucket) => {
    const bucketTasks = getTasksInRange(tasks, { start: bucket.start, end: bucket.end });
    const focusSeconds = store.state.timeEntries
      .filter((entry) => {
        const startedAt = new Date(entry.startedAt);
        return startedAt >= bucket.start && startedAt < bucket.end;
      })
      .reduce((total, entry) => total + store.getTimerElapsed(entry), 0);
    return {
      day: bucket.label,
      due: bucketTasks.filter((task) => {
        const dueDate = parseTaskDate(task.due);
        return dueDate && dueDate >= bucket.start && dueDate < bucket.end;
      }).length,
      completed: bucketTasks.filter((task) => task.status === "Done").length,
      overdue: bucketTasks.filter((task) => isTaskOverdue(task)).length,
      focus: Math.ceil(focusSeconds / 1800)
    };
  });
}

function getAnalyticsBuckets(mode: AnalyticsRangeMode) {
  if (mode === "week") {
    const range = getCurrentWeekRange();
    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(range.start);
      start.setDate(range.start.getDate() + index);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      return { start, end, label: start.toLocaleDateString(undefined, { weekday: "short" }) };
    });
  }

  if (mode === "month") {
    const range = getCurrentMonthRange();
    return buildWeekBuckets(range.start, range.end);
  }

  if (mode === "quarter") {
    const range = getCurrentQuarterRange();
    return buildWeekBuckets(range.start, range.end);
  }

  const today = toDateOnly(new Date());
  const start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  return Array.from({ length: 12 }, (_, index) => {
    const bucketStart = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const bucketEnd = new Date(bucketStart.getFullYear(), bucketStart.getMonth() + 1, 1);
    return { start: bucketStart, end: bucketEnd, label: bucketStart.toLocaleDateString(undefined, { month: "short" }) };
  });
}

function buildWeekBuckets(start: Date, end: Date) {
  const buckets: Array<{ start: Date; end: Date; label: string }> = [];
  let cursor = new Date(start);
  let index = 1;
  while (cursor < end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor);
    bucketEnd.setDate(bucketEnd.getDate() + 7);
    if (bucketEnd > end) bucketEnd.setTime(end.getTime());
    buckets.push({ start: bucketStart, end: bucketEnd, label: `W${index}` });
    cursor = bucketEnd;
    index += 1;
  }
  return buckets;
}

function isPastDue(value: string) {
  const date = parseTaskDate(value);
  if (!date) return false;
  return toDateOnly(date).getTime() < toDateOnly(new Date()).getTime();
}

function isTaskOverdue(task: Pick<Task, "status" | "due">) {
  return task.status !== "Done" && isPastDue(task.due);
}

function taskSurfaceClass(task: Pick<Task, "status" | "due">) {
  return cn(
    isTaskOverdue(task) && "border-red-200 bg-red-50 text-red-950 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100",
    task.status === "Done" && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/20 dark:bg-emerald-400/10"
  );
}

function taskDueClass(task: Pick<Task, "status" | "due">) {
  return cn(
    isTaskOverdue(task) && "font-semibold text-red-700 dark:text-red-200",
    task.status === "Done" && "text-emerald-700 dark:text-emerald-200"
  );
}

function daysBetween(startDate: Date, endDate: Date) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((toDateOnly(endDate).getTime() - toDateOnly(startDate).getTime()) / msPerDay);
}

function toDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function useChartData(store: ReturnType<typeof useWorkspaceStore>, weeklyProgress?: DashboardAnalytics["weeklyProgress"]) {
  return useMemo(() => {
    if (weeklyProgress?.length) {
      return weeklyProgress.map((item) => ({
        day: item.day,
        tasks: (item.completed ?? 0) + (item.created ?? 0) + (item.due ?? 0),
        completed: item.completed ?? 0,
        due: item.due ?? 0,
        overdue: item.overdue ?? 0,
        created: item.created ?? 0,
        open: item.open ?? 0,
        focus: Math.ceil(Math.max(item.focusedSeconds ?? item.focusedMinutes * 60, getLocalFocusSecondsForDay(store, item.day)) / 1800)
      }));
    }

    const today = new Date();
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (4 - index));
      const dateKey = toDateKey(date);
      const completed = store.state.tasks.filter((task) => task.status === "Done" && taskDateKey(task.due) === dateKey).length;
      const due = store.state.tasks.filter((task) => taskDateKey(task.due) === dateKey).length;
      const created = store.state.tasks.filter((task) => task.updatedAt && taskDateKey(task.updatedAt.slice(0, 10)) === dateKey).length;
      const focus = Math.ceil(
        store.state.timeEntries
          .filter((entry) => toDateKey(new Date(entry.startedAt)) === dateKey)
          .reduce((total, entry) => total + store.getTimerElapsed(entry), 0) / 1800
      );
      return {
        day: date.toLocaleDateString(undefined, { weekday: "short" }),
        tasks: completed + due + created,
        completed,
        due,
        overdue: store.state.tasks.filter((task) => task.status !== "Done" && isTaskOverdue(task)).length,
        created,
        open: store.state.tasks.filter((task) => task.status !== "Done").length,
        focus
      };
    });
  }, [weeklyProgress, store]);
}

function getLocalFocusSecondsForDay(store: ReturnType<typeof useWorkspaceStore>, dayLabel: string) {
  const today = new Date();
  const matchingDate = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return date;
  }).find((date) => date.toLocaleDateString("en-US", { weekday: "short" }) === dayLabel);
  if (!matchingDate) return 0;
  const key = toDateKey(matchingDate);
  return store.state.timeEntries
    .filter((entry) => toDateKey(new Date(entry.startedAt)) === key)
    .reduce((total, entry) => total + store.getTimerElapsed(entry), 0);
}

function useDashboardWidgets() {
  const [widgets, setWidgets] = useState(defaultDashboardWidgets);

  return {
    widgets,
    setWidget(id: DashboardWidgetId, visible: boolean) {
      setWidgets((current) => ({ ...current, [id]: visible }));
    },
    resetWidgets() {
      setWidgets(defaultDashboardWidgets);
    }
  };
}

function useWorkspaceNotifications(store: ReturnType<typeof useWorkspaceStore>) {
  return useMemo(() => {
    const today = new Date();
    const todayKey = toDateKey(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowKey = toDateKey(tomorrow);
    const notifications: Array<{ id: string; title: string; body: string; tone?: "default" | "warning" | "success" }> = [];

    store.state.tasks
      .filter((task) => task.status !== "Done")
      .forEach((task) => {
        const dueKey = taskDateKey(task.due);
        if (!dueKey) return;
        if (dueKey < todayKey) notifications.push({ id: `overdue-${task.id}`, title: "Overdue task", body: `${task.title} was due ${formatDateLabel(task.due)}.`, tone: "warning" });
        if (dueKey === todayKey) notifications.push({ id: `due-today-${task.id}`, title: "Due today", body: `${task.title} is due today.`, tone: "warning" });
        if (dueKey === tomorrowKey) notifications.push({ id: `due-tomorrow-${task.id}`, title: "Due tomorrow", body: `${task.title} is due tomorrow.` });
      });

    const runningTimer = store.metrics.runningTimer;
    if (runningTimer?.status === "Running") {
      const minutes = Math.round(store.getTimerElapsed(runningTimer) / 60);
      if (minutes >= 60) notifications.unshift({ id: `timer-${runningTimer.id}`, title: "Timer still running", body: `${runningTimer.title} has been running for ${minutes} minutes.`, tone: "warning" });
    }

    return notifications.slice(0, 12);
  }, [store, store.metrics.runningTimer, store.state.tasks]);
}

function mergeNotifications(
  backendNotifications: WorkspaceNotification[],
  localNotifications: Array<{ id: string; title: string; body: string; tone?: "default" | "warning" | "success" }>
) {
  const seen = new Set<string>();
  return [...backendNotifications, ...localNotifications].filter((notification) => {
    const key = `${notification.title}:${notification.body}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function formatSeconds(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatCompactDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  if (hours > 0) return remainingSeconds > 0 ? `${hours}h ${minutes}m ${remainingSeconds}s` : minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function priorityClass(priority: string) {
  return cn(
    priority === "Urgent" && "border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200",
    priority === "High" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
    priority === "Medium" && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200",
    priority === "Low" && "border-border bg-background text-muted-foreground"
  );
}

function priorityTextClass(priority: string) {
  return cn(
    priority === "Urgent" && "text-red-600 dark:text-red-300",
    priority === "High" && "text-amber-600 dark:text-amber-300",
    priority === "Medium" && "text-blue-600 dark:text-blue-300",
    priority === "Low" && "text-muted-foreground"
  );
}

function severityClass(severity: string) {
  return cn(
    severity === "Critical" && "border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200",
    severity === "High" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
  );
}

function CopyAction({ text, label, notify }: { text: string; label: string; notify: (message: string) => void }) {
  async function copy() {
    await copyTextToClipboard(text, notify);
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void copy()}>
      <ClipboardCopy className="h-4 w-4" />
      {label}
    </Button>
  );
}

async function copyTextToClipboard(text: string, notify: (message: string) => void) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    notify("Copied to clipboard.");
    window.setTimeout(() => notify(""), 2200);
  } catch {
    notify("Copy failed. Select the text manually.");
    window.setTimeout(() => notify(""), 2600);
  }
}

function useCommandItems(store: ReturnType<typeof useWorkspaceStore>): CommandResult[] {
  return useMemo(
    () => [
      { type: "Action", title: "Create task", meta: "Open the full task creation form", view: "Tasks" as const, icon: Plus, action: "create-task" as const },
      { type: "Action", title: "Create note", meta: "Open the note editor", view: "Notes" as const, icon: FileText, action: "create-note" as const },
      { type: "Action", title: "Start focus timer", meta: "Begin a running time entry", view: "Time Tracker" as const, icon: Timer, action: "start-timer" as const },
      { type: "AI", title: "Ask AI about this search", meta: "Use the command query as assistant context", view: "Dashboard" as const, icon: Sparkles, action: "ai-search" as const },
      { type: "Action", title: "Switch workspace", meta: "Jump to the next available workspace", view: "Dashboard" as const, icon: Sparkles, action: "switch-workspace" as const },
      { type: "Action", title: "Toggle theme", meta: "Switch light or dark mode", view: "Settings" as const, icon: Settings, action: "toggle-theme" as const },
      { type: "AI", title: "Generate daily summary", meta: "Assistant action", view: "Dashboard" as const, icon: Sparkles, action: "generate-daily-summary" as const },
      ...store.state.tasks.map((task) => ({ type: "Task", title: task.title, meta: `${task.status} - ${task.due}`, view: "Tasks" as const, icon: Workflow })),
      ...store.state.projects.map((project) => ({ type: "Project", title: project.name, meta: `${project.progress}% - ${project.due}`, view: "Projects" as const, icon: FolderKanban })),
      ...store.state.notes.map((note) => ({ type: "Note", title: note.title, meta: note.pinned ? "Pinned" : note.updatedAt, view: "Notes" as const, icon: FileText })),
      ...store.state.tasks.filter((task) => task.workType === "Ticket").map((ticket) => ({ type: "Ticket", title: ticket.title, meta: `${ticket.ticketNumber || "Ticket"} - ${ticket.status}`, view: "Tickets" as const, icon: Ticket })),
      ...store.state.sqlSnippets.map((snippet) => ({ type: "SQL", title: snippet.title, meta: snippet.folder, view: "SQL Library" as const, icon: Code2 })),
      ...store.state.articles.map((article) => ({ type: "Article", title: article.title, meta: "Knowledge Base", view: "Knowledge Base" as const, icon: BookOpen })),
      ...store.state.events.map((event) => ({ type: "Calendar", title: event.title, meta: `${event.start} - ${event.type}`, view: "Calendar" as const, icon: CalendarDays })),
      ...store.state.files.map((file) => ({ type: "File", title: file.name, meta: file.linkedType, view: "Files" as const, icon: FileText })),
      ...store.state.templates.map((template) => ({ type: "Template", title: template.name, meta: template.category, view: "Templates" as const, icon: ClipboardCopy })),
      ...store.state.templates.map((template) => ({
        type: "Action",
        title: `Copy template: ${template.name}`,
        meta: template.category,
        view: "Templates" as const,
        icon: ClipboardCopy,
        action: "copy-template" as const,
        entityId: template.id
      }))
    ],
    [store.state.articles, store.state.events, store.state.files, store.state.notes, store.state.projects, store.state.sqlSnippets, store.state.tasks, store.state.templates]
  );
}

function mapSearchResultToCommand(result: GlobalSearchResult): CommandResult {
  const map: Record<GlobalSearchResult["type"], Pick<CommandResult, "type" | "view" | "icon">> = {
    task: { type: "Task", view: "Tasks", icon: Workflow },
    project: { type: "Project", view: "Projects", icon: FolderKanban },
    note: { type: "Note", view: "Notes", icon: FileText },
    ticket: { type: "Ticket", view: "Tickets", icon: Ticket },
    sql: { type: "SQL", view: "SQL Library", icon: Code2 },
    article: { type: "Article", view: "Knowledge Base", icon: BookOpen },
    file: { type: "File", view: "Files", icon: FileText },
    template: { type: "Template", view: "Templates", icon: ClipboardCopy },
    calendar: { type: "Calendar", view: "Calendar", icon: CalendarDays }
  };
  const mapped = map[result.type];

  return {
    ...mapped,
    title: result.title,
    meta: result.subtitle || "Backend result",
    entityId: result.id
  };
}

function mergeCommandItems(localItems: CommandResult[], backendItems: CommandResult[]) {
  const seen = new Set<string>();
  return [...localItems, ...backendItems].filter((item) => {
    const key = `${item.type}:${item.entityId ?? item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

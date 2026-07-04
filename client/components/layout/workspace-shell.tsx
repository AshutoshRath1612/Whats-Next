"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  CalendarDays,
  ChevronLeft,
  Clock3,
  Code2,
  Command,
  FileText,
  FolderKanban,
  Gamepad2,
  Home,
  LayoutTemplate,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Ticket,
  User,
  Workflow
} from "lucide-react";
import { useTheme } from "next-themes";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkspaceView } from "@/lib/workspace/types";
import { CommandPalette, CommandResult } from "./command-palette";

type ShellWorkspace = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  _count?: {
    projects: number;
    tasks: number;
    notes: number;
    tickets: number;
  };
};

const navigation = [
  { label: "Dashboard", icon: Home },
  { label: "Workspace", icon: Boxes },
  { label: "Tasks", icon: Workflow },
  { label: "Projects", icon: FolderKanban },
  { label: "Tickets", icon: Ticket },
  { label: "Knowledge Base", icon: BookOpen },
  { label: "Notes", icon: FileText },
  { label: "SQL Library", icon: Code2 },
  { label: "Calendar", icon: CalendarDays },
  { label: "Time Tracker", icon: Clock3 },
  { label: "Files", icon: Boxes },
  { label: "Templates", icon: LayoutTemplate },
  { label: "Analytics", icon: BarChart3 },
  { label: "Personal", icon: User },
  { label: "Gaming", icon: Gamepad2 },
  { label: "Settings", icon: Settings }
];

let rememberedSidebarScrollTop = 0;

export function WorkspaceShell({
  children,
  activeView = "Dashboard",
  onNavigate,
  onCreate,
  onCommand,
  onCommandQueryChange,
  commandLoading,
  commandItems,
  user,
  onLogout,
  workspaceName = "Workspace",
  workspaces = [],
  activeWorkspaceId,
  onWorkspaceChange,
  onWorkspaceCreate,
  onOpenAssistant,
  workspaceLoading,
  notifications = [],
  storageUsedBytes = 0,
  storageConnected = true,
  storageError = null
}: {
  children: ReactNode;
  activeView?: WorkspaceView;
  onNavigate?: (view: WorkspaceView) => void;
  onCreate?: () => void;
  onCommand?: (item: CommandResult) => void;
  onCommandQueryChange?: (query: string) => void;
  commandLoading?: boolean;
  commandItems?: CommandResult[];
  user?: { name: string; email: string; avatarUrl?: string | null } | null;
  onLogout?: () => void;
  workspaceName?: string;
  workspaces?: ShellWorkspace[];
  activeWorkspaceId?: string;
  onWorkspaceChange?: (workspaceId: string) => void;
  onWorkspaceCreate?: () => void;
  onOpenAssistant?: () => void;
  workspaceLoading?: boolean;
  notifications?: Array<{ id: string; title: string; body: string; tone?: "default" | "warning" | "success" }>;
  storageUsedBytes?: number;
  storageConnected?: boolean;
  storageError?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navScrollRef = useRef<HTMLElement | null>(null);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const themeIcon = useMemo(() => (resolvedTheme === "dark" ? Sun : Moon), [resolvedTheme]);
  const ThemeIcon = themeIcon;
  const displayWorkspaceName = workspaceLoading ? "Loading workspace..." : workspaceName;
  const canSwitchWorkspace = workspaces.length > 1 && Boolean(onWorkspaceChange);
  const storageProgress = Math.min(100, Math.round((storageUsedBytes / (1024 * 1024 * 1024)) * 100));
  const storageLabel = storageConnected ? formatBytes(storageUsedBytes) : "Check storage";
  const navigate = (view: WorkspaceView) => {
    rememberedSidebarScrollTop = navScrollRef.current?.scrollTop ?? rememberedSidebarScrollTop;
    onNavigate?.(view);
    setMobileOpen(false);
    window.requestAnimationFrame(() => {
      if (navScrollRef.current) navScrollRef.current.scrollTop = rememberedSidebarScrollTop;
    });
  };
  const runCommand = (item: CommandResult) => {
    if (item.action === "toggle-theme") {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
      onCommand?.(item);
      return;
    }

    if (item.action) {
      onCommand?.(item);
      return;
    }
    navigate(item.view);
  };

  useEffect(() => {
    window.requestAnimationFrame(() => {
      if (navScrollRef.current) navScrollRef.current.scrollTop = rememberedSidebarScrollTop;
    });
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.10),transparent_32rem),hsl(var(--background))]">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onSelect={runCommand} items={commandItems} onQueryChange={onCommandQueryChange} loading={commandLoading} />
      {notificationsOpen && <button aria-label="Close notifications" className="fixed inset-0 z-30 cursor-default" onClick={() => setNotificationsOpen(false)} />}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}>
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="h-full w-[min(86vw,320px)] border-r border-border bg-card p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center gap-3">
              <img src="/brand/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl shadow-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">What's Next?</p>
                <p className="truncate text-xs text-muted-foreground">{displayWorkspaceName}</p>
              </div>
            </div>
            <nav className="space-y-1">
              {navigation.map((item) => (
                <button
                  key={item.label}
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
                    item.label === activeView && "bg-primary/10 text-primary"
                  )}
                  onClick={() => navigate(item.label as WorkspaceView)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>
          </motion.aside>
        </div>
      )}
      <div className="flex min-h-screen">
        <motion.aside
          animate={{ width: collapsed ? 82 : 284 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="sticky top-0 hidden h-screen shrink-0 border-r border-border/80 bg-card/80 p-4 backdrop-blur-xl lg:block"
        >
          <div className="flex h-full flex-col">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <img src="/brand/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl shadow-sm" />
                {!collapsed && (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">What's Next?</p>
                    <p className="truncate text-xs text-muted-foreground">{displayWorkspaceName}</p>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={() => setCollapsed((value) => !value)}>
                <ChevronLeft className={cn("h-4 w-4 transition", collapsed && "rotate-180")} />
              </Button>
            </div>

            <button
              className={cn(
                "mb-4 flex h-10 items-center gap-3 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground shadow-sm transition hover:bg-secondary",
                collapsed && "justify-center px-0"
              )}
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Search anything</span>
                  <kbd className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
                </>
              )}
            </button>

            <nav
              ref={navScrollRef}
              className="flex-1 space-y-1 overflow-y-auto pr-1"
              onScroll={(event) => {
                rememberedSidebarScrollTop = event.currentTarget.scrollTop;
              }}
            >
              {navigation.map((item) => (
                <button
                  key={item.label}
                  className={cn(
                    "group flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
                    item.label === activeView && "bg-primary/10 text-primary",
                    collapsed && "justify-center px-0"
                  )}
                  onClick={() => navigate(item.label as WorkspaceView)}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              ))}
            </nav>

            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              {!collapsed ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Workspace storage</span>
                    <Badge className={cn(!storageConnected && "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100")}>{storageLabel}</Badge>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className={cn("h-full rounded-full", storageConnected ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${storageConnected ? storageProgress : 100}%` }} />
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{storageConnected ? "Uploaded files and workspace backups." : storageError ?? "Workspace storage could not be checked."}</p>
                </>
              ) : (
                <Boxes className="mx-auto h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-border/80 bg-background/82 backdrop-blur-xl">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Workspaces</span>
                  <span>/</span>
                  <div className="flex min-w-0 items-center gap-1">
                    {canSwitchWorkspace ? (
                      <select
                        aria-label="Current workspace"
                        className="max-w-[220px] rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground outline-none transition focus:border-primary"
                        value={activeWorkspaceId ?? ""}
                        onChange={(event) => onWorkspaceChange?.(event.target.value)}
                      >
                        {workspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="truncate font-medium text-foreground">{displayWorkspaceName}</span>
                    )}
                    {onWorkspaceCreate && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="New workspace" onClick={onWorkspaceCreate}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <h1 className="truncate text-lg font-semibold">{activeView === "Dashboard" ? "Today in What's Next?" : activeView}</h1>
              </div>
              <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setPaletteOpen(true)}>
                <Command className="h-4 w-4" />
                Command
              </Button>
              <Button variant="outline" onClick={onOpenAssistant}>
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Ask AI</span>
              </Button>
              <div className="relative">
                <Button variant="ghost" size="icon" aria-label="Notifications" onClick={() => setNotificationsOpen((value) => !value)}>
                  <Bell className="h-5 w-5" />
                </Button>
                {notifications.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />}
                {notificationsOpen && (
                  <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-card p-3 shadow-2xl">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Notifications</p>
                      <Badge>{notifications.length}</Badge>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-auto">
                      {notifications.length === 0 && <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">No active notifications.</p>}
                      {notifications.map((notification) => (
                        <div key={notification.id} className={cn("rounded-lg border border-border bg-background p-3", notification.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100")}>
                          <p className="text-sm font-medium">{notification.title}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{notification.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle theme"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                <ThemeIcon className="h-5 w-5" />
              </Button>
              <div className="hidden items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 lg:flex">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="max-w-36 truncate text-xs font-medium">{user?.name ?? "Workspace User"}</p>
                  <p className="max-w-36 truncate text-[11px] text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Logout" onClick={onLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
              <Button onClick={onCreate}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">
            <div className="mx-auto max-w-[1580px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

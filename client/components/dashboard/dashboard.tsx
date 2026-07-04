"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  FileText,
  Flame,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Sparkles,
  Timer,
  Workflow
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const tasks = [
  { title: "Design dashboard information architecture", priority: "High", status: "In Progress", due: "Today", progress: 72 },
  { title: "Model workspace relationships in Prisma", priority: "Urgent", status: "Review", due: "Tomorrow", progress: 88 },
  { title: "Create AI assistant prompt presets", priority: "Medium", status: "Todo", due: "Friday", progress: 34 },
  { title: "Write import/export backup strategy", priority: "High", status: "Todo", due: "Next week", progress: 18 }
];

const projects = [
  { name: "What's Next? Launch", progress: 64, meta: "38 tasks - 4 milestones", color: "bg-indigo-500" },
  { name: "Personal Knowledge Base", progress: 42, meta: "12 articles - 8 notes", color: "bg-emerald-500" },
  { name: "SQL Operations Library", progress: 78, meta: "29 snippets - 6 folders", color: "bg-blue-500" }
];

const activity = [
  "Ticket NX-1042 moved to Investigating",
  "Product principles note was updated",
  "Open task aging report was favorited",
  "Weekly planning review added to calendar"
];

const chartData = [
  { day: "Mon", tasks: 6, focus: 180 },
  { day: "Tue", tasks: 9, focus: 240 },
  { day: "Wed", tasks: 5, focus: 150 },
  { day: "Thu", tasks: 11, focus: 300 },
  { day: "Fri", tasks: 8, focus: 210 },
  { day: "Sat", tasks: 4, focus: 90 },
  { day: "Sun", tasks: 3, focus: 60 }
];

const kanban = [
  { title: "Todo", items: ["AI prompt presets", "Backup settings", "Keyboard shortcut docs"] },
  { title: "In Progress", items: ["Dashboard IA", "Calendar reminders"] },
  { title: "Review", items: ["Prisma relationships", "Auth guards"] }
];

export function Dashboard() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200">
                  Daily workspace
                </Badge>
                <Badge>Friday, June 26</Badge>
              </div>
              <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">Focus on the launch workspace today.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                You have 4 priority tasks, 2 deadlines, one running timer, and a calendar review later today.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button>
                <Plus className="h-4 w-4" />
                Capture
              </Button>
              <Button variant="outline">
                <Sparkles className="h-4 w-4" />
                Summarize
              </Button>
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric title="Open Tasks" value="24" detail="+6 due this week" icon={Workflow} tone="indigo" />
          <Metric title="Focus Time" value="18h" detail="72% of weekly goal" icon={Timer} tone="emerald" />
          <Metric title="Tickets" value="7" detail="2 high priority" icon={Flame} tone="amber" />
          <Metric title="Completed" value="41" detail="+13 vs last week" icon={CheckCircle2} tone="blue" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Today's Tasks</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Prioritized across tasks, tickets, calendar, and notes.</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Task actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.map((task) => (
                <motion.div
                  key={task.title}
                  whileHover={{ y: -2 }}
                  className="rounded-xl border border-border bg-background p-4 transition hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <button className="mt-0.5 h-5 w-5 rounded-full border border-border" aria-label={`Complete ${task.title}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-medium">{task.title}</h3>
                        <Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{task.status}</span>
                        <span>{task.due}</span>
                      </div>
                      <Progress value={task.progress} className="mt-3" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Weekly Progress</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Completed tasks and focused minutes.</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="focus" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.36} />
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} />
                    <YAxis axisLine={false} tickLine={false} fontSize={12} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                    <Area type="monotone" dataKey="focus" stroke="#4F46E5" fill="url(#focus)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pinned Projects</CardTitle>
              <Button variant="ghost" size="sm">
                View all
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {projects.map((project) => (
                <div key={project.name} className="rounded-xl border border-border bg-background p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className={cn("h-3 w-3 rounded-full", project.color)} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">{project.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">{project.meta}</p>
                    </div>
                    <span className="text-sm font-semibold">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kanban Snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {kanban.map((column) => (
                  <div key={column.title} className="rounded-xl border border-border bg-background p-3">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">{column.title}</h3>
                    <div className="space-y-2">
                      {column.items.map((item) => (
                        <div key={item} className="rounded-lg border border-border bg-card p-2 text-xs leading-5">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Running Timer</CardTitle>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              Active
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium">Dashboard IA</p>
              <p className="mt-1 text-xs text-muted-foreground">What's Next? Launch</p>
              <div className="my-5 text-4xl font-semibold tracking-normal">01:42:18</div>
              <div className="flex gap-2">
                <Button size="sm">
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
                <Button variant="outline" size="sm">
                  <Play className="h-4 w-4" />
                  Resume
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {["09:30 Sprint review", "11:00 SQL cleanup", "15:30 Product notes", "17:00 Daily summary"].map((event) => (
              <div key={event} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                {event}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Suggestions</CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Turn NX-1042 investigation into an RCA draft.",
              "Create 3 subtasks for backup and export settings.",
              "Summarize recent notes into a weekly update."
            ].map((suggestion) => (
              <button key={suggestion} className="w-full rounded-xl border border-border bg-background p-3 text-left text-sm leading-5 transition hover:bg-secondary">
                {suggestion}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Notes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {["Product principles", "Import/export backup strategy", "Meeting notes - workspace beta"].map((note) => (
              <div key={note} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{note}</span>
                <Copy className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -26, right: 4, top: 8, bottom: 0 }}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="tasks" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Metric({ title, value, detail, icon: Icon, tone }: { title: string; value: string; detail: string; icon: typeof Workflow; tone: string }) {
  const toneMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200"
  };

  return (
    <Card className="transition hover:-translate-y-0.5 hover:shadow-soft">
      <CardContent className="flex items-center gap-4 p-5">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function priorityClass(priority: string) {
  return cn(
    priority === "Urgent" && "border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200",
    priority === "High" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
    priority === "Medium" && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200"
  );
}

export type WorkspaceView =
  | "Dashboard"
  | "Workspace"
  | "Tasks"
  | "Projects"
  | "Tickets"
  | "Knowledge Base"
  | "Notes"
  | "SQL Library"
  | "Calendar"
  | "Time Tracker"
  | "Files"
  | "Templates"
  | "Analytics"
  | "Personal"
  | "Gaming"
  | "Settings";

export type TaskStatus = "Backlog" | "Todo" | "In Progress" | "Pending" | "Review" | "Done";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type RecurrenceRule = "None" | "Daily" | "Weekly" | "Monthly";
export type TaskWorkType = "Task" | "Ticket";
export type TicketSeverity = "Low" | "Medium" | "High" | "Critical";

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type TaskNote = {
  id: string;
  body: string;
  createdAt: string;
};

export type TaskSubtask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due?: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  projectId?: string;
  owner: string;
  workType: TaskWorkType;
  status: TaskStatus;
  priority: Priority;
  ticketNumber?: string;
  customer?: string;
  severity?: TicketSeverity;
  investigation?: string;
  resolution?: string;
  closureNotes?: string;
  overdueReason?: string;
  recurringRule: RecurrenceRule;
  startDate: string;
  due: string;
  updatedAt?: string;
  tags: string[];
  checklist: ChecklistItem[];
  subtasks: TaskSubtask[];
  dependencies: string[];
  attachments: string[];
  acceptanceCriteria: string;
  notes: TaskNote[];
  progress: number;
  estimateMinutes: number;
  actualMinutes: number;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  icon: string;
  coverUrl: string;
  color: string;
  progress: number;
  due: string;
  pinned: boolean;
  archived?: boolean;
  milestones: ProjectMilestone[];
};

export type ProjectMilestone = {
  id: string;
  title: string;
  due: string;
  completed: boolean;
};

export type Note = {
  id: string;
  projectId?: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
  versions: NoteVersion[];
};

export type NoteVersion = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  projectId?: string;
  pinned: boolean;
  savedAt: string;
};

export type Ticket = {
  id: string;
  number: string;
  title: string;
  customer: string;
  priority: Priority;
  severity: TicketSeverity;
  status: "Open" | "Investigating" | "Waiting" | "Resolved" | "Closed";
};

export type KnowledgeArticle = {
  id: string;
  title: string;
  problem: string;
  rootCause: string;
  resolution: string;
  tags: string[];
  references: string[];
};

export type SqlSnippet = {
  id: string;
  title: string;
  description: string;
  query: string;
  folder: string;
  executionNotes: string;
  favorite: boolean;
  tags: string[];
  history: SqlSnippetVersion[];
};

export type SqlSnippetVersion = {
  id: string;
  title: string;
  description: string;
  query: string;
  folder: string;
  executionNotes: string;
  tags: string[];
  favorite: boolean;
  savedAt: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  type: "Meeting" | "Focus" | "Reminder";
  taskId?: string;
  projectId?: string;
  reminderEnabled: boolean;
  reminderMinutes: number;
};

export type Template = {
  id: string;
  name: string;
  category: string;
  body: string;
  variables: string[];
  favorite: boolean;
};

export type FileAsset = {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  linkedType: "Task" | "Project" | "Note" | "Backup" | "None";
  linkedId?: string;
  uploadedAt: string;
};

export type TimeEntry = {
  id: string;
  title: string;
  taskId?: string;
  status: "Running" | "Paused" | "Stopped";
  startedAt: number;
  elapsedSeconds: number;
};

export type WorkspaceState = {
  tasks: Task[];
  projects: Project[];
  notes: Note[];
  tickets: Ticket[];
  articles: KnowledgeArticle[];
  sqlSnippets: SqlSnippet[];
  events: CalendarEvent[];
  templates: Template[];
  files: FileAsset[];
  timeEntries: TimeEntry[];
  aiDraft: string;
};

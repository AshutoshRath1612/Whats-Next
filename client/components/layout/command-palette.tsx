"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, type LucideIcon } from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { WorkspaceView } from "@/lib/workspace/types";

export type CommandResult = {
  type: string;
  title: string;
  meta: string;
  view: WorkspaceView;
  icon?: LucideIcon;
  action?: "create-task" | "create-note" | "start-timer" | "copy-template" | "generate-daily-summary" | "ai-search" | "switch-workspace" | "toggle-theme";
  entityId?: string;
};

export function CommandPalette({
  open,
  onOpenChange,
  items = [],
  onSelect,
  onQueryChange,
  loading
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items?: CommandResult[];
  onSelect?: (item: CommandResult) => void;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(
    () => items.filter((item) => `${item.type} ${item.title} ${item.meta}`.toLowerCase().includes(query.toLowerCase())),
    [items, query]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items]);

  function selectItem(item: CommandResult | undefined) {
    if (!item) return;
    onSelect?.(item);
    onOpenChange(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectItem(filtered[activeIndex]);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => onOpenChange(false)}
        >
          <motion.div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex h-14 items-center gap-3 border-b border-border px-4">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onKeyDown={handleKeyDown}
                onChange={(event) => {
                  setQuery(event.target.value);
                  onQueryChange?.(event.target.value);
                }}
                placeholder="Search tasks, notes, tickets, SQL, files, templates..."
                className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">Esc</kbd>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Searching workspace...</div>}
              {!loading && filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matching commands or workspace items.</div>}
              {filtered.map((item, index) => (
                <button
                  key={`${item.type}-${item.title}-${item.meta}-${item.action ?? item.view}-${item.entityId ?? ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectItem(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30",
                    index === activeIndex && "bg-secondary/70"
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {item.icon ? <item.icon className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.type} - {item.meta}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

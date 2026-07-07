"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Bell, CheckCircle2, Info, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type ToastTone = "default" | "success" | "warning" | "error" | "info";

export type ToastInput = string | {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

export type AppToast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  durationMs: number;
};

type ToastContextValue = (input: ToastInput, tone?: ToastTone) => string | undefined;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback<ToastContextValue>((input, tone) => {
    const toast = normalizeToast(input, tone);
    if (!toast) return undefined;

    setToasts((current) => [toast, ...current.filter((item) => item.id !== toast.id)].slice(0, 5));
    window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return toast.id;
  }, [dismissToast]);

  const value = useMemo(() => showToast, [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}

function ToastViewport({ toasts, onDismiss }: { toasts: AppToast[]; onDismiss: (toastId: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[80] flex flex-col-reverse gap-3 sm:inset-x-auto sm:right-5 sm:w-[24rem]" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: AppToast; onDismiss: (toastId: string) => void }) {
  const tone = toastToneMap[toast.tone];
  const Icon = tone.icon;

  return (
    <motion.div
      layout
      role={toast.tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
      className={cn("pointer-events-auto overflow-hidden rounded-xl border bg-card shadow-2xl shadow-slate-950/12 backdrop-blur", tone.card)}
    >
      <div className="flex items-start gap-3 p-4">
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone.iconWrap)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5 text-foreground">{toast.title}</p>
          {toast.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{toast.description}</p>}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(toast.id)}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <motion.div
        className={cn("h-0.5 origin-left", tone.progress)}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: toast.durationMs / 1000, ease: "linear" }}
      />
    </motion.div>
  );
}

function normalizeToast(input: ToastInput, tone?: ToastTone): AppToast | null {
  if (typeof input === "string") {
    const title = input.trim();
    if (!title) return null;
    const inferredTone = tone ?? inferTone(title);
    return {
      id: createToastId(),
      title,
      tone: inferredTone,
      durationMs: inferredTone === "error" ? 5600 : 3800
    };
  }

  const title = input.title.trim();
  if (!title) return null;
  const resolvedTone = input.tone ?? tone ?? inferTone(`${input.title} ${input.description ?? ""}`);
  return {
    id: createToastId(),
    title,
    description: input.description?.trim() || undefined,
    tone: resolvedTone,
    durationMs: input.durationMs ?? (resolvedTone === "error" ? 5600 : 4200)
  };
}

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferTone(message: string): ToastTone {
  const normalized = message.toLowerCase();
  if (/\b(failed|failure|error|unable|could not|invalid|missing|denied)\b/.test(normalized)) return "error";
  if (/\b(overdue|warning|attention|not enabled|required)\b/.test(normalized)) return "warning";
  if (/\b(saved|created|uploaded|restored|copied|generated|enabled|changed|sent|updated)\b/.test(normalized)) return "success";
  return "default";
}

const toastToneMap: Record<ToastTone, { icon: typeof Bell; card: string; iconWrap: string; progress: string }> = {
  default: {
    icon: Bell,
    card: "border-border",
    iconWrap: "bg-secondary text-foreground",
    progress: "bg-primary"
  },
  info: {
    icon: Info,
    card: "border-blue-200 dark:border-blue-400/20",
    iconWrap: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200",
    progress: "bg-blue-500"
  },
  success: {
    icon: CheckCircle2,
    card: "border-emerald-200 dark:border-emerald-400/20",
    iconWrap: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200",
    progress: "bg-emerald-500"
  },
  warning: {
    icon: AlertTriangle,
    card: "border-amber-200 dark:border-amber-400/20",
    iconWrap: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200",
    progress: "bg-amber-500"
  },
  error: {
    icon: AlertTriangle,
    card: "border-destructive/30",
    iconWrap: "bg-destructive/10 text-destructive",
    progress: "bg-destructive"
  }
};

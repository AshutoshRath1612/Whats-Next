import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-border bg-secondary px-2.5 text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

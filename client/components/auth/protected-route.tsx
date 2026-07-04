"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "unauthenticated") router.replace("/login");
  }, [auth.status, router]);

  if (auth.status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <img src="/brand/icon-192.png" alt="" className="h-10 w-10 animate-pulse rounded-xl shadow-sm" />
          <span className="text-sm">Loading workspace...</span>
        </div>
      </main>
    );
  }

  return children;
}

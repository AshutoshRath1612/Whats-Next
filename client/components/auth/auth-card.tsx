"use client";

import Link from "next/link";
import { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_30rem),hsl(var(--background))] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col justify-center">
        <Link href="/login" className="mb-8 flex items-center gap-3 self-center">
          <img src="/brand/icon-192.png" alt="" className="h-11 w-11 rounded-xl shadow-sm" />
          <span className="text-lg font-semibold">What's Next?</span>
        </Link>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          {footer && <div className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">{footer}</div>}
        </section>
      </div>
    </main>
  );
}

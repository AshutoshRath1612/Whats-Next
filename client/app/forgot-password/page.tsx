"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { forgotPasswordRequest } from "@/lib/auth/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setResetUrl("");
    setSubmitting(true);

    try {
      const response = await forgotPasswordRequest(email);
      setMessage("If an account exists, a reset link has been generated.");
      setResetUrl(response.resetUrl ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start password reset");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Enter your account email to receive a short-lived reset link."
      footer={<Link href="/login" className="font-medium text-primary">Back to sign in</Link>}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">{message}</p>}
        {resetUrl && <a href={resetUrl} className="block rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground">Open local reset link</a>}
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Generating..." : "Send reset link"}</Button>
      </form>
    </AuthCard>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resetPasswordRequest } from "@/lib/auth/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("Reset token is missing.");
      toast({ title: "Reset token missing", description: "Open the latest reset link and try again.", tone: "warning" });
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      toast({ title: "Passwords do not match", description: "Confirm password must match the new password.", tone: "warning" });
      return;
    }

    setSubmitting(true);
    try {
      await resetPasswordRequest({ token, password });
      setMessage("Password updated. Redirecting to sign in...");
      toast({ title: "Password updated", description: "Redirecting to sign in.", tone: "success" });
      window.setTimeout(() => router.replace("/login"), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update password";
      setError(message);
      toast({ title: "Password update failed", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Use the reset link from your email or local development reset request."
      footer={<Link href="/login" className="font-medium text-primary">Back to sign in</Link>}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">New password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Confirm password</span>
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">{message}</p>}
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Updating..." : "Update password"}</Button>
      </form>
    </AuthCard>
  );
}

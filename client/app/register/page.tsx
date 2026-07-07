"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (auth.status === "authenticated" && !submitting && !registered) router.replace("/");
  }, [auth.status, registered, router, submitting]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      toast({ title: "Passwords do not match", description: "Confirm password must match the password field.", tone: "warning" });
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      toast({ title: "Password is too short", description: "Use at least 8 characters.", tone: "warning" });
      return;
    }
    setSubmitting(true);
    try {
      await auth.register({ name, email, password });
      setRegistered(true);
      toast({ title: "Account created", description: "Let’s set up your workspace.", tone: "success" });
      router.replace("/?onboarding=1");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create account";
      setError(message);
      toast({ title: "Account creation failed", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Set up your workspace and start organizing tasks, notes, tickets, SQL, calendar, and time tracking in one place."
      footer={
        <>
          Already have an account? <Link href="/login" className="font-medium text-primary">Sign in</Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Confirm password</span>
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</Button>
      </form>
    </AuthCard>
  );
}

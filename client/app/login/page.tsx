"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (auth.status === "authenticated") router.replace("/");
  }, [auth.status, router]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;
    const clientId = googleClientId;

    function initializeGoogle() {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (!response.credential) return;
          setError("");
          setSubmitting(true);
          try {
            await auth.loginWithGoogle(response.credential);
            toast({ title: "Signed in", description: "Opening your workspace.", tone: "success" });
            router.replace("/");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to sign in with Google";
            setError(message);
            toast({ title: "Google sign-in failed", description: message, tone: "error" });
          } finally {
            setSubmitting(false);
          }
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: googleButtonRef.current.offsetWidth || 320
      });
    }

    if (window.google) {
      initializeGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    document.head.appendChild(script);
  }, [auth, googleClientId, router, toast]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await auth.login({ email, password });
      toast({ title: "Signed in", description: "Opening your workspace.", tone: "success" });
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in";
      setError(message);
      toast({ title: "Sign-in failed", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Continue to your daily workspace, tasks, notes, tickets, calendar, timers, and knowledge base."
      footer={
        <>
          New to What's Next? <Link href="/register" className="font-medium text-primary">Create an account</Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">Forgot password?</Link>
        </div>
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</Button>
        {googleClientId ? (
          <div ref={googleButtonRef} className="min-h-10 w-full" />
        ) : (
          <div className="space-y-2">
            <Button type="button" variant="outline" className="w-full" disabled>
              Sign in with Google
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              Google login is available after setting NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID.
            </p>
          </div>
        )}
      </form>
    </AuthCard>
  );
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(input: { client_id: string; callback: (response: { credential?: string }) => void }): void;
          renderButton(element: HTMLElement, options: { theme: string; size: string; width?: number }): void;
        };
      };
    };
  }
}

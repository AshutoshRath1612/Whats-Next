"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { AuthUser, googleLoginRequest, loginRequest, logoutRequest, refreshRequest, registerRequest, sessionRequest } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  login(input: { email: string; password: string }): Promise<void>;
  loginWithGoogle(idToken: string): Promise<void>;
  register(input: { name: string; email: string; password: string }): Promise<void>;
  updateUser(user: AuthUser): void;
  logout(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    sessionRequest()
      .then((response) => {
        if (response.authenticated) {
          saveSession(response.accessToken, response.user);
        } else {
          clearSession();
          setStatus("unauthenticated");
        }
      })
      .catch(() => {
        clearSession();
        setStatus("unauthenticated");
      });
  }, []);

  function saveSession(nextToken: string, nextUser: AuthUser) {
    setToken(nextToken);
    setUser(nextUser);
    setStatus("authenticated");
  }

  function clearSession() {
    setToken(null);
    setUser(null);
  }

  function expireSession() {
    clearSession();
    setStatus("unauthenticated");
  }

  useEffect(() => {
    if (status !== "authenticated" || !token) return;
    const expiresAt = getJwtExpiryMs(token);
    if (!expiresAt) return;

    const delay = expiresAt - Date.now() - 60_000;
    if (delay <= 0) {
      void refreshSession();
      return;
    }

    const timeout = window.setTimeout(() => void refreshSession(), delay);
    return () => window.clearTimeout(timeout);
  }, [status, token]);

  async function refreshSession() {
    try {
      const response = await refreshRequest();
      saveSession(response.accessToken, response.user);
    } catch {
      expireSession();
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      async login(input) {
        const response = await loginRequest(input);
        saveSession(response.accessToken, response.user);
      },
      async loginWithGoogle(idToken) {
        const response = await googleLoginRequest(idToken);
        saveSession(response.accessToken, response.user);
      },
      async register(input) {
        const response = await registerRequest(input);
        saveSession(response.accessToken, response.user);
      },
      updateUser(nextUser) {
        setUser(nextUser);
      },
      logout() {
        void logoutRequest(token).catch(() => undefined);
        clearSession();
        setStatus("unauthenticated");
      }
    }),
    [status, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function getJwtExpiryMs(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

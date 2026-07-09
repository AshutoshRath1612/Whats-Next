export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  timezone?: string;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type AuthSessionResponse =
  | { authenticated: false }
  | ({ authenticated: true } & AuthResponse);

export type ForgotPasswordResponse = {
  sent: boolean;
  resetUrl?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message ?? "Request failed";
    throw new Error(message);
  }
  return payload as T;
}

export async function loginRequest(input: { email: string; password: string }) {
  return normalizeAuthResponse(await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  }));
}

export async function registerRequest(input: { name: string; email: string; password: string }) {
  return normalizeAuthResponse(await request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  }));
}

export async function googleLoginRequest(idToken: string) {
  return normalizeAuthResponse(await request<AuthResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken })
  }));
}

export async function refreshRequest() {
  return normalizeAuthResponse(await request<AuthResponse>("/auth/refresh", {
    method: "POST"
  }));
}

export async function sessionRequest() {
  const response = await request<AuthSessionResponse>("/auth/session", {
    method: "POST"
  });
  return response.authenticated ? { ...response, user: normalizeAuthUser(response.user) } : response;
}

export async function meRequest(token?: string | null) {
  return normalizeAuthUser(await request<AuthUser>("/users/me", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  }));
}

export function logoutRequest(token?: string | null) {
  return request<void>("/auth/logout", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

export function forgotPasswordRequest(email: string) {
  return request<ForgotPasswordResponse>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function resetPasswordRequest(input: { token: string; password: string }) {
  return request<{ updated: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateProfileRequest(token: string | null | undefined, input: { name?: string; avatarUrl?: string; timezone?: string }) {
  return normalizeAuthUser(await request<AuthUser>("/users/me", {
    method: "PATCH",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(input)
  }));
}

export function changePasswordRequest(token: string | null | undefined, input: { currentPassword: string; nextPassword: string }) {
  return request<{ updated: boolean }>("/users/me/change-password", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(input)
  });
}

export function listSessionsRequest(token: string | null | undefined) {
  return request<Array<{ id: string; createdAt: string; expiresAt: string; revokedAt?: string | null }>>("/users/me/sessions", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

export function logoutAllDevicesRequest(token: string | null | undefined) {
  return request<{ revoked: boolean }>("/users/me/logout-all", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

function normalizeAuthResponse(response: AuthResponse): AuthResponse {
  return { ...response, user: normalizeAuthUser(response.user) };
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  return { ...user, avatarUrl: normalizeApiFileUrl(user.avatarUrl) };
}

function normalizeApiFileUrl(value?: string | null) {
  if (!value) return value;
  if (value.startsWith("/files/")) return `${API_URL.replace(/\/$/, "")}${value}`;
  if (value.startsWith("/api/")) return `${API_URL.replace(/\/api\/?$/, "")}${value}`;
  return value;
}

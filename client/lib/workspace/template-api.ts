import { Template } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiTemplate = {
  id: string;
  name: string;
  category: string;
  body: string;
  variables: string[];
  isFavorite?: boolean;
};

export type CreateTemplateInput = Pick<Template, "name" | "category" | "body"> & Partial<Pick<Template, "variables" | "favorite">>;

async function templateRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export function mapApiTemplate(template: ApiTemplate): Template {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    body: template.body,
    variables: template.variables,
    favorite: template.isFavorite ?? false
  };
}

export function listTemplatesRequest(token: string | null | undefined, workspaceId: string) {
  return templateRequest<ApiTemplate[]>(`/templates?workspaceId=${encodeURIComponent(workspaceId)}`, token);
}

export function createTemplateRequest(token: string | null | undefined, workspaceId: string, input: CreateTemplateInput) {
  return templateRequest<ApiTemplate>("/templates", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      name: input.name,
      category: input.category,
      body: input.body,
      variables: input.variables
    })
  });
}

export function updateTemplateRequest(token: string | null | undefined, template: Template) {
  return templateRequest<ApiTemplate>(`/templates/${template.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      name: template.name,
      category: template.category,
      body: template.body,
      variables: template.variables,
      favorite: template.favorite
    })
  });
}

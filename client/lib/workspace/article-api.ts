import { KnowledgeArticle } from "./types";

export type CreateArticleInput = Pick<KnowledgeArticle, "title" | "problem" | "rootCause" | "resolution"> & {
  tags?: string[];
  references?: string[];
};

type ApiArticle = {
  id: string;
  title: string;
  problem: string;
  rootCause?: string | null;
  resolution: string;
  tags?: string[];
  references?: string[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function articleRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
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

export function mapApiArticle(article: ApiArticle): KnowledgeArticle {
  return {
    id: article.id,
    title: article.title,
    problem: article.problem,
    rootCause: article.rootCause ?? "",
    resolution: article.resolution,
    tags: article.tags ?? [],
    references: article.references ?? []
  };
}

export function createArticleRequest(token: string | null | undefined, workspaceId: string, input: CreateArticleInput) {
  return articleRequest<ApiArticle>("/articles", token, {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      title: input.title,
      problem: input.problem,
      rootCause: input.rootCause,
      resolution: input.resolution,
      tags: input.tags ?? ["documentation"],
      references: input.references ?? []
    })
  });
}

export function updateArticleRequest(token: string | null | undefined, article: KnowledgeArticle) {
  return articleRequest<ApiArticle>(`/articles/${article.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      title: article.title,
      problem: article.problem,
      rootCause: article.rootCause,
      resolution: article.resolution,
      tags: article.tags,
      references: article.references
    })
  });
}

export function listArticlesRequest(token: string | null | undefined, workspaceId: string) {
  return articleRequest<ApiArticle[]>(`/articles?workspaceId=${encodeURIComponent(workspaceId)}`, token);
}

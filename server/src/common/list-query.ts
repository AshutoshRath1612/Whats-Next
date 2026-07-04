export type ListQuery = {
  q?: string;
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortDir?: string;
};

export function parseListQuery(query: ListQuery) {
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "50", 10) || 50));
  return {
    q: query.q,
    skip: (page - 1) * pageSize,
    take: pageSize,
    sortBy: query.sortBy,
    sortDir: query.sortDir === "asc" ? "asc" as const : "desc" as const
  };
}

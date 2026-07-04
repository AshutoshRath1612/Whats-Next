const sensitiveKeyPattern = /(password|token|secret|cookie|authorization|api[_-]?key|access[_-]?key|private[_-]?key|credential|session|jwt)/i;
const largePayloadKeyPattern = /(file|base64|bytes|buffer|avatar|image|video|attachment|dataUrl)/i;
const maxStringLength = 1_000;
const maxArrayItems = 20;
const maxObjectKeys = 50;
const maxStackLength = 4_000;

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value === undefined) return null;
  if (value === null) return value;
  if (typeof value === "string") return truncate(value, maxStringLength);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 6) return "[Max depth reached]";

  if (Array.isArray(value)) {
    const items = value.slice(0, maxArrayItems).map((item) => sanitizeForLog(item, depth + 1));
    if (value.length > maxArrayItems) items.push(`[${value.length - maxArrayItems} more items]`);
    return items;
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value).slice(0, maxObjectKeys)) {
      if (sensitiveKeyPattern.test(key)) {
        output[key] = "[Redacted]";
        continue;
      }
      if (largePayloadKeyPattern.test(key)) {
        output[key] = summarizeLargePayload(childValue);
        continue;
      }
      output[key] = sanitizeForLog(childValue, depth + 1);
    }
    const totalKeys = Object.keys(value).length;
    if (totalKeys > maxObjectKeys) output.__truncatedKeys = totalKeys - maxObjectKeys;
    return output;
  }

  return String(value);
}

export function sanitizeStack(stack?: string) {
  return stack ? truncate(stack, maxStackLength) : undefined;
}

export function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`;
}

function summarizeLargePayload(value: unknown) {
  if (typeof value === "string") return `[Redacted large payload: ${value.length} chars]`;
  if (Array.isArray(value)) return `[Redacted large payload array: ${value.length} items]`;
  if (value && typeof value === "object") return "[Redacted large payload object]";
  return "[Redacted large payload]";
}

export function errorText(value: unknown, fallback = "request failed"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  if (value instanceof Error && value.message) return value.message;
  return fallback;
}

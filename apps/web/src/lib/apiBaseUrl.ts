const DEFAULT_API_URL = "http://localhost:7071/api";

/**
 * Normalize API base URL so callers can safely append endpoint paths.
 * Accepts either:
 * - full API base ending in /api
 * - host root (we append /api)
 */
export function resolveApiBaseUrl(rawApiUrl: string | undefined): string {
  const candidate = (rawApiUrl ?? DEFAULT_API_URL).trim();
  if (!candidate) return DEFAULT_API_URL;

  const withoutTrailingSlashes = candidate.replace(/\/+$/, "");
  if (withoutTrailingSlashes.endsWith("/api")) {
    return withoutTrailingSlashes;
  }

  return `${withoutTrailingSlashes}/api`;
}

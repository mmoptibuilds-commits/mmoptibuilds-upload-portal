import { randomBytes } from "node:crypto";
import { normalizeStorageRelativePath } from "@/lib/storage-path";

export function opaqueId(bytes = 32) { return randomBytes(bytes).toString("base64url"); }

export function safeRelativePath(input: string) {
  return normalizeStorageRelativePath(input);
}

export function safeRedirect(value: string | null, fallback = "/upload") {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/**
 * State-changing browser requests must originate from this application.
 * Missing Origin is allowed for non-browser clients and local health tooling;
 * Fetch Metadata still rejects an explicitly cross-site request.
 */
export function isSameOriginRequest(request: Pick<Request, "headers" | "url">) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

export function errorMessage(status: number, fallback = "The request could not be completed.") {
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return "You do not have permission for that action.";
  if (status === 404) return "The requested item no longer exists.";
  if (status === 429) return "The service is busy. Please wait a moment and retry.";
  if (status >= 500) return "The storage service is temporarily unavailable. Your files are safe; retry this item.";
  return fallback;
}

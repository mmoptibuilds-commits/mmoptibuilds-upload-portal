import { randomBytes } from "node:crypto";

export function opaqueId(bytes = 32) { return randomBytes(bytes).toString("base64url"); }

export function safeRelativePath(input: string) {
  const normalized = input.normalize("NFC").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === ".." || /[\u0000-\u001f]/.test(part))) {
    throw new Error("The file path is invalid.");
  }
  return parts.join("/");
}

export function safeRedirect(value: string | null, fallback = "/upload") {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function errorMessage(status: number, fallback = "The request could not be completed.") {
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return "You do not have permission for that action.";
  if (status === 404) return "The requested item no longer exists.";
  if (status === 429) return "The service is busy. Please wait a moment and retry.";
  if (status >= 500) return "The storage service is temporarily unavailable. Your files are safe; retry this item.";
  return fallback;
}

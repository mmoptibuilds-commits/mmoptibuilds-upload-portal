import { createHmac } from "node:crypto";

type Bucket = { failures: number[]; blockedUntil: number; touchedAt: number };

const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 10;
const BLOCK_MS = 60 * 1000;
const buckets = new Map<string, Bucket>();

function fingerprint(value: string) {
  return createHmac("sha256", process.env.AUTH_SECRET || "mmoptibuilds-local-rate-limit")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

function bucketFor(key: string) {
  const now = Date.now();
  const current = buckets.get(key) ?? { failures: [], blockedUntil: 0, touchedAt: now };
  current.failures = current.failures.filter((time) => time > now - WINDOW_MS);
  current.touchedAt = now;
  buckets.set(key, current);
  return current;
}

function prune(now: number) {
  for (const [key, bucket] of buckets) if (bucket.touchedAt <= now - WINDOW_MS && bucket.blockedUntil <= now) buckets.delete(key);
  if (buckets.size <= 4000) return;
  const oldest = [...buckets.entries()].sort(([, left], [, right]) => left.touchedAt - right.touchedAt).slice(0, buckets.size - 4000);
  for (const [key] of oldest) buckets.delete(key);
}

function keySet(ip: string, username: string) {
  return [`ip:${fingerprint(ip || "unknown")}`, `user:${fingerprint(username || "unknown")}`];
}

export function checkLoginRateLimit(ip: string, username: string) {
  const blockedUntil = Math.max(...keySet(ip, username).map((key) => bucketFor(key).blockedUntil));
  return blockedUntil > Date.now() ? { allowed: false, retryAfter: Math.ceil((blockedUntil - Date.now()) / 1000) } : { allowed: true, retryAfter: 0 };
}

export function recordLoginFailure(ip: string, username: string) {
  const now = Date.now();
  for (const key of keySet(ip, username)) {
    const bucket = bucketFor(key);
    bucket.failures.push(now);
    if (bucket.failures.length >= MAX_FAILURES) bucket.blockedUntil = now + BLOCK_MS;
  }
  prune(now);
}

export function clearLoginAccount(username: string) {
  buckets.delete(`user:${fingerprint(username || "unknown")}`);
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNotificationEventUpdate,
  buildCompletedUploadUpdate,
  classifyStorageObjectVerification,
  decideNotificationClaim,
  decideNotificationClaimForTransaction,
  decideUploadCompletionTransaction,
  NOTIFICATION_CLAIM_TTL_MS,
  parseUploadCompletionRequest,
  uploadCompletionRequestSchema,
} from "../src/lib/upload-completion.ts";
import { buildCompletionEmailText } from "../src/lib/email.ts";

const fileId = "3d711a0d-cd18-42a0-bfab-4b192b122a74";
const storagePath = "7e89105e-7a3a-4f48-93a7-60ab8bc4e548/d0a5484d-aa26-4c2f-9709-4f77bdb132c9/folder/file.txt";

describe("upload completion contract", () => {
  it("accepts only the database file id as the completion signal", () => {
    assert.deepEqual(uploadCompletionRequestSchema.parse({ fileId }), { fileId });
    assert.equal(uploadCompletionRequestSchema.safeParse({ fileId, path: storagePath }).success, false);
    assert.equal(uploadCompletionRequestSchema.safeParse({ fileId, objectId: "provider-object" }).success, false);
    assert.equal(uploadCompletionRequestSchema.safeParse({ fileId, driveFileId: "legacy-object" }).success, false);
  });

  it("treats malformed JSON as invalid completion data", async () => {
    const result = await parseUploadCompletionRequest({
      json: async () => { throw new SyntaxError("malformed JSON"); },
    });

    assert.deepEqual(result, { kind: "invalid" });
  });

  it("requires the derived path and immutable size and content type to match", () => {
    const expected = { storagePath, size: 42, mimeType: "Text/Plain; charset=UTF-8" };

    assert.equal(classifyStorageObjectVerification(expected, {
      path: storagePath,
      size: 42,
      contentType: "text/plain",
      lastModified: "2026-09-21T00:01:00.000Z",
    }), "verified");
    assert.equal(classifyStorageObjectVerification(expected, {
      path: `${storagePath}.other`, size: 42, contentType: "text/plain", lastModified: null,
    }), "mismatch");
    assert.equal(classifyStorageObjectVerification(expected, {
      path: storagePath, size: 43, contentType: "text/plain", lastModified: null,
    }), "mismatch");
    assert.equal(classifyStorageObjectVerification(expected, {
      path: storagePath, size: 42, contentType: "application/pdf", lastModified: null,
    }), "mismatch");
    assert.equal(classifyStorageObjectVerification(expected, {
      path: storagePath, size: null, contentType: null, lastModified: null,
    }), "mismatch");
  });

  it("builds an idempotent storage-neutral completion update", () => {
    const completedAt = new Date("2026-09-21T00:02:00.000Z");
    const update = buildCompletedUploadUpdate(42, completedAt);

    assert.deepEqual(update, {
      status: "completed",
      completedBytes: 42,
      completedAt,
      errorCategory: null,
    });
    assert.equal("driveFileId" in update, false);
    assert.equal("driveParentId" in update, false);
    assert.equal("resumableSessionUrl" in update, false);
  });

  it("builds provider-neutral notification text without a URL", () => {
    const text = buildCompletionEmailText({
      username: "client-a",
      batchId: "d0a5484d-aa26-4c2f-9709-4f77bdb132c9",
      fileCount: 2,
      totalBytes: 42,
      completedAt: new Date("2026-09-21T00:02:00.000Z"),
    });

    assert.match(text, /User: client-a/);
    assert.match(text, /Files: 2/);
    assert.doesNotMatch(text, /Drive|Supabase|https?:\/\//i);
  });

  it("bounds notification event errors to a fixed provider-neutral code", () => {
    const maliciousProviderError = new Error(`smtp://attacker.example/${"private-id-".repeat(5000)}\nrecipient@example.com`);

    const update = buildNotificationEventUpdate("failed", maliciousProviderError);

    assert.deepEqual(update, { status: "failed", error: "smtp_delivery_failed" });
    assert.ok(update.error.length < 64);
    assert.doesNotMatch(update.error, /attacker|private-id|recipient|smtp:\/\//i);
    assert.deepEqual(buildNotificationEventUpdate("sent"), { status: "sent", error: null });
  });

  it("keeps active pending claims, retries expired claims, and skips terminal notification states", () => {
    const now = new Date("2026-09-21T00:10:00.000Z");
    const active = decideNotificationClaim({
      notificationStatus: "pending",
      activePendingCreatedAt: new Date(now.getTime() - NOTIFICATION_CLAIM_TTL_MS + 1),
      now,
      ttlMs: NOTIFICATION_CLAIM_TTL_MS,
    });
    const expired = decideNotificationClaim({
      notificationStatus: "pending",
      activePendingCreatedAt: new Date(now.getTime() - NOTIFICATION_CLAIM_TTL_MS - 1),
      now,
      ttlMs: NOTIFICATION_CLAIM_TTL_MS,
    });

    assert.deepEqual(active, { kind: "skip", status: "pending" });
    assert.deepEqual(expired, { kind: "claim" });
    assert.deepEqual(decideNotificationClaim({ notificationStatus: "sent", activePendingCreatedAt: null, now, ttlMs: NOTIFICATION_CLAIM_TTL_MS }), { kind: "skip", status: "sent" });
    assert.deepEqual(decideNotificationClaim({ notificationStatus: "not_configured", activePendingCreatedAt: null, now, ttlMs: NOTIFICATION_CLAIM_TTL_MS }), { kind: "skip", status: "not_configured" });
  });

  it("routes production transaction claim decisions through the contract for terminal states", async () => {
    const now = new Date("2026-09-21T00:10:00.000Z");
    const calls: string[] = [];
    const evaluate = (input: Parameters<typeof decideNotificationClaim>[0]) => {
      calls.push(input.notificationStatus);
      return decideNotificationClaim(input);
    };
    const mustNotLoadActiveClaim = async () => {
      throw new Error("terminal notification status must not query active claims");
    };

    assert.deepEqual(await decideNotificationClaimForTransaction({
      notificationStatus: "sent",
      now,
      ttlMs: NOTIFICATION_CLAIM_TTL_MS,
    }, mustNotLoadActiveClaim, evaluate), { kind: "skip", status: "sent" });
    assert.deepEqual(await decideNotificationClaimForTransaction({
      notificationStatus: "not_configured",
      now,
      ttlMs: NOTIFICATION_CLAIM_TTL_MS,
    }, mustNotLoadActiveClaim, evaluate), { kind: "skip", status: "not_configured" });

    assert.deepEqual(calls, ["sent", "not_configured"]);
  });

  it("rejects a current row whose owner or immutable metadata no longer matches", () => {
    const batch = {
      id: "d0a5484d-aa26-4c2f-9709-4f77bdb132c9",
      userId: "7e89105e-7a3a-4f48-93a7-60ab8bc4e548",
      status: "uploading",
      fileCount: 1,
      totalBytes: 42,
      completedAt: null,
    } as const;
    const current = {
      id: fileId,
      batchId: batch.id,
      relativePath: "folder/file.txt",
      storagePath,
      size: 42,
      mimeType: "text/plain",
      status: "uploading",
    } as const;
    const expected = {
      userId: batch.userId,
      username: "client-a",
      fileId,
      batchId: batch.id,
      relativePath: current.relativePath,
      storagePath,
      size: current.size,
      mimeType: current.mimeType,
      fileStatus: current.status,
      batchStatus: batch.status,
    };
    const verification = { path: storagePath, size: 42, contentType: "text/plain", lastModified: null };
    const now = new Date("2026-09-21T00:10:00.000Z");

    assert.equal(decideUploadCompletionTransaction({
      snapshot: expected,
      batch: { ...batch, userId: "another-user" },
      current,
      verification,
      counts: { total: 1, completed: 0 },
      now,
    }).kind, "unavailable");
    assert.equal(decideUploadCompletionTransaction({
      snapshot: expected,
      batch,
      current: { ...current, size: 43 },
      verification,
      counts: { total: 1, completed: 0 },
      now,
    }).kind, "verification_mismatch");
    assert.equal(decideUploadCompletionTransaction({
      snapshot: { ...expected, storagePath: "another-user/another-batch/file.txt" },
      batch,
      current: { ...current, storagePath: "another-user/another-batch/file.txt" },
      verification: { ...verification, path: "another-user/another-batch/file.txt" },
      counts: { total: 1, completed: 0 },
      now,
    }).kind, "verification_mismatch");
  });

  it("makes terminal and idempotent transition decisions without a provider call", () => {
    const batch = {
      id: "d0a5484d-aa26-4c2f-9709-4f77bdb132c9",
      userId: "7e89105e-7a3a-4f48-93a7-60ab8bc4e548",
      status: "uploading",
      fileCount: 1,
      totalBytes: 42,
      completedAt: null,
    } as const;
    const current = {
      id: fileId,
      batchId: batch.id,
      relativePath: "folder/file.txt",
      storagePath,
      size: 42,
      mimeType: "text/plain",
      status: "completed",
    } as const;
    const snapshot = {
      userId: batch.userId,
      username: "client-a",
      fileId,
      batchId: batch.id,
      relativePath: current.relativePath,
      storagePath,
      size: current.size,
      mimeType: current.mimeType,
      fileStatus: "uploading",
      batchStatus: batch.status,
    };
    const now = new Date("2026-09-21T00:10:00.000Z");

    assert.equal(decideUploadCompletionTransaction({ snapshot, batch: { ...batch, status: "failed" }, current, verification: null, counts: { total: 1, completed: 1 }, now }).kind, "terminal");
    assert.deepEqual(decideUploadCompletionTransaction({ snapshot, batch, current, verification: null, counts: { total: 1, completed: 1 }, now }), {
      kind: "complete",
      transitioned: true,
      fileUpdate: null,
      completedAt: now,
    });
    assert.deepEqual(decideUploadCompletionTransaction({ snapshot, batch: { ...batch, status: "completed", completedAt: now }, current, verification: null, counts: { total: 1, completed: 1 }, now }), {
      kind: "complete",
      transitioned: false,
      fileUpdate: null,
      completedAt: now,
    });
    assert.equal(decideUploadCompletionTransaction({
      snapshot,
      batch,
      current: { ...current, status: "cancelled" },
      verification: null,
      counts: { total: 1, completed: 0 },
      now,
    }).kind, "terminal");
  });
});

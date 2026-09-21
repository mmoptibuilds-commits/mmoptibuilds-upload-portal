import type { CompletionNotificationInput, NotificationStatus } from "@/lib/types";
import { deriveStorageObjectPath } from "@/lib/storage-path";
import { z } from "zod";

export const uploadCompletionRequestSchema = z.object({
  fileId: z.string().uuid(),
}).strict();

export const NOTIFICATION_CLAIM_TTL_MS = 2 * 60 * 1000;
export const NOTIFICATION_PROVIDER_ERROR = "smtp_delivery_failed";

export type StorageObjectVerification = {
  path: string;
  size: number | null;
  contentType: string | null;
  lastModified: string | null;
};

export interface UploadCompletionSnapshot {
  userId: string;
  username: string;
  fileId: string;
  batchId: string;
  relativePath: string;
  storagePath: string | null;
  size: number;
  mimeType: string;
  fileStatus: string;
  batchStatus: string;
}

export type UploadCompletionFinalization =
  | { kind: "partial" }
  | { kind: "unavailable" }
  | { kind: "terminal" }
  | { kind: "verification_mismatch" }
  | {
      kind: "complete";
      transitioned: boolean;
      notification: CompletionNotificationInput;
    };

export type UploadCompletionResult =
  | Exclude<UploadCompletionFinalization, { kind: "complete" }>
  | (Extract<UploadCompletionFinalization, { kind: "complete" }> & {
      notificationStatus: NotificationStatus;
    });

export interface UploadCompletionDependencies {
  loadOwned(input: { userId: string; username: string; fileId: string }): Promise<UploadCompletionSnapshot | null>;
  verify(input: { userId: string; batchId: string; relativePath: string }): Promise<StorageObjectVerification>;
  finalize(snapshot: UploadCompletionSnapshot, verification: StorageObjectVerification | null): Promise<UploadCompletionFinalization>;
  notify(input: CompletionNotificationInput): Promise<NotificationStatus>;
}

export class UploadCompletionError extends Error {
  constructor(public readonly code: "verification_failed" | "finalization_failed") {
    super(code === "verification_failed" ? "Storage object verification failed." : "Upload completion finalization failed.");
    this.name = "UploadCompletionError";
  }
}

export function buildNotificationEventUpdate(status: NotificationStatus, _providerError?: unknown) {
  void _providerError;
  return {
    status,
    error: status === "failed" ? NOTIFICATION_PROVIDER_ERROR : null,
  };
}

export function decideNotificationClaim(input: {
  notificationStatus: NotificationStatus;
  activePendingCreatedAt: Date | null;
  now: Date;
  ttlMs: number;
}) {
  if (input.notificationStatus === "sent" || input.notificationStatus === "not_configured") {
    return { kind: "skip" as const, status: input.notificationStatus };
  }
  if (input.activePendingCreatedAt && input.activePendingCreatedAt.getTime() > input.now.getTime() - input.ttlMs) {
    return { kind: "skip" as const, status: "pending" as const };
  }
  return { kind: "claim" as const };
}

export type NotificationClaimDecision = ReturnType<typeof decideNotificationClaim>;
export type NotificationClaimEvaluator = (input: Parameters<typeof decideNotificationClaim>[0]) => NotificationClaimDecision;

export async function decideNotificationClaimForTransaction(
  input: Omit<Parameters<typeof decideNotificationClaim>[0], "activePendingCreatedAt">,
  loadActivePendingCreatedAt: () => Promise<Date | null>,
  evaluate: NotificationClaimEvaluator = decideNotificationClaim,
): Promise<NotificationClaimDecision> {
  // Evaluate terminal statuses before the active-claim lookup. This keeps the
  // existing sent/not_configured skip path and SQL behavior while routing every
  // current status through the same production decision contract.
  const initialDecision = evaluate({ ...input, activePendingCreatedAt: null });
  if (initialDecision.kind === "skip") return initialDecision;

  return evaluate({
    ...input,
    activePendingCreatedAt: await loadActivePendingCreatedAt(),
  });
}

function normalizeContentType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

export function classifyStorageObjectVerification(
  expected: Pick<UploadCompletionSnapshot, "storagePath" | "size" | "mimeType">,
  verification: StorageObjectVerification,
) {
  if (
    !expected.storagePath
    || verification.path !== expected.storagePath
    || verification.size === null
    || verification.size !== expected.size
    || verification.contentType === null
    || normalizeContentType(verification.contentType) !== normalizeContentType(expected.mimeType)
  ) {
    return "mismatch" as const;
  }
  return "verified" as const;
}

export function buildCompletedUploadUpdate(size: number, completedAt: Date) {
  return {
    status: "completed" as const,
    completedBytes: size,
    completedAt,
    errorCategory: null,
  };
}

export type UploadCompletionTransactionDecision =
  | { kind: "unavailable" }
  | { kind: "terminal" }
  | { kind: "verification_mismatch" }
  | { kind: "partial"; fileUpdate: ReturnType<typeof buildCompletedUploadUpdate> | null }
  | {
      kind: "complete";
      transitioned: boolean;
      fileUpdate: ReturnType<typeof buildCompletedUploadUpdate> | null;
      completedAt: Date;
    };

export function decideUploadCompletionTransaction(input: {
  snapshot: UploadCompletionSnapshot;
  batch: {
    id: string;
    userId: string;
    status: string;
    fileCount: number;
    totalBytes: number;
    completedAt: Date | null;
  } | null;
  current: {
    id: string;
    batchId: string;
    relativePath: string;
    storagePath: string | null;
    size: number;
    mimeType: string;
    status: string;
  } | null;
  verification: StorageObjectVerification | null;
  counts: { total: number; completed: number } | null;
  now: Date;
}): UploadCompletionTransactionDecision {
  const { snapshot, batch, current, verification, counts, now } = input;
  if (
    !batch
    || batch.id !== snapshot.batchId
    || batch.userId !== snapshot.userId
    || !current
    || current.id !== snapshot.fileId
    || current.batchId !== batch.id
  ) {
    return { kind: "unavailable" };
  }
  if (batch.status === "cancelled" || batch.status === "failed") return { kind: "terminal" };
  if (current.status === "cancelled" || current.status === "failed") return { kind: "terminal" };

  if (
    current.relativePath !== snapshot.relativePath
    || current.storagePath !== snapshot.storagePath
    || current.size !== snapshot.size
    || current.mimeType !== snapshot.mimeType
  ) {
    return { kind: "verification_mismatch" };
  }

  if (batch.status === "completed") {
    if (current.status !== "completed") return { kind: "unavailable" };
    return {
      kind: "complete",
      transitioned: false,
      fileUpdate: null,
      completedAt: batch.completedAt ?? now,
    };
  }
  if (!counts) return { kind: "unavailable" };

  let expectedStoragePath: string;
  try {
    expectedStoragePath = deriveStorageObjectPath(snapshot.userId, batch.id, current.relativePath);
  } catch {
    return { kind: "verification_mismatch" };
  }
  if (current.storagePath !== expectedStoragePath) return { kind: "verification_mismatch" };

  let fileUpdate: ReturnType<typeof buildCompletedUploadUpdate> | null = null;
  let completedCount = counts.completed;
  if (current.status !== "completed") {
    if (!verification || classifyStorageObjectVerification(current, verification) !== "verified") {
      return { kind: "verification_mismatch" };
    }
    fileUpdate = buildCompletedUploadUpdate(current.size, now);
    completedCount += 1;
  }

  if (counts.total !== batch.fileCount || completedCount !== batch.fileCount) {
    return { kind: "partial", fileUpdate };
  }
  return { kind: "complete", transitioned: true, fileUpdate, completedAt: now };
}

export async function parseUploadCompletionRequest(request: Pick<Request, "json">) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { kind: "invalid" as const };
  }
  const parsed = uploadCompletionRequestSchema.safeParse(body);
  return parsed.success ? { kind: "valid" as const, data: parsed.data } : { kind: "invalid" as const };
}

export function createUploadCompletionOrchestrator(dependencies: UploadCompletionDependencies) {
  return async function completeUpload(input: { userId: string; username: string; fileId: string }): Promise<UploadCompletionResult> {
    const snapshot = await dependencies.loadOwned(input);
    if (!snapshot) return { kind: "unavailable" };

    let verification: StorageObjectVerification | null = null;
    if (snapshot.fileStatus !== "completed" && snapshot.batchStatus !== "completed") {
      try {
        verification = await dependencies.verify({
          userId: snapshot.userId,
          batchId: snapshot.batchId,
          relativePath: snapshot.relativePath,
        });
      } catch {
        throw new UploadCompletionError("verification_failed");
      }
      if (classifyStorageObjectVerification(snapshot, verification) !== "verified") {
        return { kind: "verification_mismatch" };
      }
    }

    let finalization: UploadCompletionFinalization;
    try {
      finalization = await dependencies.finalize(snapshot, verification);
    } catch {
      throw new UploadCompletionError("finalization_failed");
    }
    if (finalization.kind !== "complete") return finalization;

    let notificationStatus: NotificationStatus = "failed";
    try {
      notificationStatus = await dependencies.notify(finalization.notification);
    } catch {
      // Notifications are advisory. Completion remains durable and retry-safe.
    }
    return { ...finalization, notificationStatus };
  };
}

export function mapUploadCompletionResult(result: UploadCompletionResult) {
  if (result.kind === "complete") {
    return {
      status: 200,
      body: { ok: true, batchComplete: true, notificationStatus: result.notificationStatus },
    } as const;
  }
  if (result.kind === "partial") {
    return { status: 200, body: { ok: true, batchComplete: false } } as const;
  }
  if (result.kind === "verification_mismatch") {
    return { status: 409, body: { error: "The uploaded object does not match the expected file." } } as const;
  }
  return { status: 404, body: { error: "Upload file not found." } } as const;
}

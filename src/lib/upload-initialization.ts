import { MAX_BATCH_BYTES } from "@/lib/constants";
import { z } from "zod";

export const uploadInitializationRequestSchema = z.object({
  batchId: z.string().uuid(),
  relativePath: z.string().min(1).max(2048),
  size: z.number().int().nonnegative().max(MAX_BATCH_BYTES),
  mimeType: z.string().max(255).optional().default("application/octet-stream"),
}).strict();

export type UploadInitializationRequest = z.infer<typeof uploadInitializationRequestSchema>;

export interface UploadInitializationInput extends UploadInitializationRequest {
  relativePath: string;
  fileName: string;
  userId: string;
  storagePath: string;
}

export interface UploadAuthorization {
  path: string;
  token: string;
}

export type UploadInitializationReservation =
  | { kind: "reserved"; fileId: string; isNew: boolean }
  | { kind: "conflict" }
  | { kind: "completed" }
  | { kind: "limit" }
  | { kind: "unavailable" };

export type UploadInitializationFinalization =
  | { kind: "authorized"; fileId: string; authorization: UploadAuthorization }
  | { kind: "conflict" }
  | { kind: "completed" }
  | { kind: "unavailable" };

export function isUploadBatchActiveStatus(status: string) {
  return status !== "cancelled" && status !== "completed" && status !== "failed";
}

export interface UploadInitializationDependencies {
  reserve(input: UploadInitializationInput): Promise<UploadInitializationReservation>;
  authorize(input: UploadInitializationInput): Promise<UploadAuthorization>;
  finalize(
    input: UploadInitializationInput,
    reservation: Extract<UploadInitializationReservation, { kind: "reserved" }>,
    authorization: UploadAuthorization,
  ): Promise<UploadInitializationFinalization>;
  markAuthorizationFailed(fileId: string): Promise<void>;
}

export class UploadInitializationError extends Error {
  constructor(public readonly code: "authorization_failed" | "finalization_failed") {
    super(code === "authorization_failed" ? "Storage upload authorization failed." : "Storage upload finalization failed.");
    this.name = "UploadInitializationError";
  }
}

export function createUploadInitializationOrchestrator(dependencies: UploadInitializationDependencies) {
  return async function initializeUpload(input: UploadInitializationInput) {
    const reservation = await dependencies.reserve(input);
    if (reservation.kind !== "reserved") return reservation;

    let authorization: UploadAuthorization;
    try {
      authorization = await dependencies.authorize(input);
    } catch {
      if (reservation.isNew) {
        try { await dependencies.markAuthorizationFailed(reservation.fileId); } catch { /* preserve the provider failure classification */ }
      }
      throw new UploadInitializationError("authorization_failed");
    }

    try {
      return await dependencies.finalize(input, reservation, authorization);
    } catch {
      throw new UploadInitializationError("finalization_failed");
    }
  };
}

export function mapUploadInitializationResult(result: UploadInitializationReservation | UploadInitializationFinalization) {
  if (result.kind === "authorized") {
    return { status: 200, body: buildSignedUploadResponse(result.fileId, result.authorization) } as const;
  }
  if (result.kind === "conflict") {
    return { status: 409, body: { error: "A different file is already queued at this path." } } as const;
  }
  if (result.kind === "completed") {
    return { status: 409, body: { error: "This file is already finalized." } } as const;
  }
  if (result.kind === "limit") {
    return { status: 409, body: { error: "This file would exceed the batch manifest limit." } } as const;
  }
  return { status: 404, body: { error: "This upload batch is unavailable." } } as const;
}

export async function parseUploadInitializationRequest(request: Pick<Request, "json">) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { kind: "invalid" as const };
  }
  const parsed = uploadInitializationRequestSchema.safeParse(body);
  return parsed.success ? { kind: "valid" as const, data: parsed.data } : { kind: "invalid" as const };
}

export interface UploadInitializationMetadata {
  batchId: string;
  relativePath: string;
  fileName: string;
  size: number;
  mimeType: string;
}

export interface ExistingUploadInitialization extends UploadInitializationMetadata {
  id: string;
  status: string;
  storagePath: string | null;
}

export function classifyUploadReservation(
  existing: ExistingUploadInitialization,
  input: UploadInitializationMetadata,
  storagePath: string,
) {
  if (
    existing.fileName !== input.fileName
    || existing.size !== input.size
    || existing.mimeType !== input.mimeType
    || (existing.storagePath !== null && existing.storagePath !== storagePath)
  ) {
    return "conflict" as const;
  }
  if (existing.status === "completed") return "completed" as const;
  return "renew" as const;
}

export function buildUploadReservationValues(
  input: UploadInitializationMetadata,
  storagePath: string,
) {
  return {
    batchId: input.batchId,
    relativePath: input.relativePath,
    fileName: input.fileName,
    size: input.size,
    mimeType: input.mimeType,
    status: "preparing" as const,
    storagePath,
  };
}

export function buildAuthorizedUploadUpdate(storagePath: string) {
  return {
    status: "uploading" as const,
    storagePath,
    errorCategory: null,
  };
}

export function buildSignedUploadResponse(
  fileId: string,
  authorization: UploadAuthorization,
) {
  return {
    fileId,
    path: authorization.path,
    token: authorization.token,
  };
}

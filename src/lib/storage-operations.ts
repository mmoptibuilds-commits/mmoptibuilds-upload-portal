import { promiseWithTimeout, TimeoutError } from "@/lib/async-timeouts";
import { deriveStorageObjectPath } from "@/lib/storage-path";

export const STORAGE_OPERATION_TIMEOUT_MS = 10_000;

type StorageOperationCode =
  | "authorization_failed"
  | "invalid_response"
  | "timeout"
  | "verification_failed";

export class StorageOperationError extends Error {
  constructor(public readonly code: StorageOperationCode, message: string) {
    super(message);
    this.name = "StorageOperationError";
  }
}

type SignedUploadResult =
  | { data: { signedUrl: string; token: string; path: string }; error: null }
  | { data: null; error: unknown };

type ObjectInfoResult =
  | {
      data: {
        size?: number;
        contentType?: string;
        lastModified?: string;
        [key: string]: unknown;
      };
      error: null;
    }
  | { data: null; error: unknown };

export interface StorageBucketOperations {
  createSignedUploadUrl(path: string, options: { upsert: boolean }): Promise<SignedUploadResult>;
  info(path: string): Promise<ObjectInfoResult>;
}

export interface OwnedStorageObject {
  userId: string;
  batchId: string;
  relativePath: string;
}

function timeoutError(error: unknown, message: string) {
  if (error instanceof TimeoutError) return new StorageOperationError("timeout", message);
  return null;
}

export function createStorageOperations(
  bucket: StorageBucketOperations,
  timeoutMs = STORAGE_OPERATION_TIMEOUT_MS,
) {
  return {
    async createSignedUploadAuthorization(input: OwnedStorageObject) {
      const path = deriveStorageObjectPath(input.userId, input.batchId, input.relativePath);
      let result: SignedUploadResult;
      try {
        result = await promiseWithTimeout(
          bucket.createSignedUploadUrl(path, { upsert: false }),
          timeoutMs,
          "Storage upload authorization",
        );
      } catch (error) {
        throw timeoutError(error, "Storage upload authorization timed out.")
          ?? new StorageOperationError("authorization_failed", "Storage upload authorization failed.");
      }

      if (result.error || !result.data) {
        throw new StorageOperationError("authorization_failed", "Storage upload authorization failed.");
      }
      if (result.data.path !== path || !result.data.token) {
        throw new StorageOperationError("invalid_response", "Storage upload authorization returned an invalid response.");
      }
      return { path, token: result.data.token };
    },

    async verifyStorageObject(input: OwnedStorageObject) {
      const path = deriveStorageObjectPath(input.userId, input.batchId, input.relativePath);
      let result: ObjectInfoResult;
      try {
        result = await promiseWithTimeout(
          bucket.info(path),
          timeoutMs,
          "Storage object verification",
        );
      } catch (error) {
        throw timeoutError(error, "Storage object verification timed out.")
          ?? new StorageOperationError("verification_failed", "Storage object verification failed.");
      }

      if (result.error || !result.data) {
        throw new StorageOperationError("verification_failed", "Storage object verification failed.");
      }
      return {
        path,
        size: result.data.size ?? null,
        contentType: result.data.contentType ?? null,
        lastModified: result.data.lastModified ?? null,
      };
    },
  };
}

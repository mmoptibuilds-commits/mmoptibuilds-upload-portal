import { Upload } from "tus-js-client";
import { TUS_CHUNK_SIZE, TUS_RETRY_DELAYS } from "@/lib/constants";

export type UploadAuthorization = {
  fileId: string;
  path: string;
  token: string;
};

export type UploadInitializationBody = {
  batchId: string;
  relativePath: string;
  size: number;
  mimeType: string;
};

export type SignedTusConfiguration = {
  storageUrl: string;
  bucket: string;
  authorization: UploadAuthorization;
  contentType: string;
};

export type TusPreviousUpload = {
  uploadUrl: string | null;
};

export type TusUploadOptions = ReturnType<typeof buildSignedTusOptions> & {
  fingerprint?: (file: File) => Promise<string>;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
};

export interface TusUploadLike {
  findPreviousUploads(): Promise<TusPreviousUpload[]>;
  resumeFromPreviousUpload(previousUpload: TusPreviousUpload): void;
  start(): void;
  abort(shouldTerminate?: boolean): Promise<void>;
}

export type TusUploadFactory = (file: File | Blob, options: TusUploadOptions) => TusUploadLike;

export function buildStorageTusEndpoint(storageUrl: string) {
  let url: URL;

  try {
    url = new URL(storageUrl);
  } catch {
    throw new Error("Storage configuration is invalid.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Storage configuration is invalid.");
  }

  const hostname =
    url.hostname.endsWith(".supabase.co") &&
    !url.hostname.endsWith(".storage.supabase.co")
      ? url.hostname.replace(
          /\.supabase\.co$/,
          ".storage.supabase.co",
        )
      : url.hostname;

  return `${url.protocol}//${hostname}${url.port ? `:${url.port}` : ""}/storage/v1/upload/resumable/sign`;
}

export function buildSignedTusOptions(input: SignedTusConfiguration) {
  return {
    endpoint: buildStorageTusEndpoint(input.storageUrl),
    headers: { "x-signature": input.authorization.token },
    metadata: {
      bucketName: input.bucket,
      objectName: input.authorization.path,
      contentType: input.contentType,
      cacheControl: "3600",
    },
    chunkSize: TUS_CHUNK_SIZE,
    retryDelays: [...TUS_RETRY_DELAYS],
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
  };
}

export function buildUploadInitializationBody(input: UploadInitializationBody) {
  return {
    batchId: input.batchId,
    relativePath: input.relativePath,
    size: input.size,
    mimeType: input.mimeType,
  };
}

export function buildUploadCompletionBody(fileId: string) {
  return { fileId };
}

export function shouldProbeUploadCompletion(input: {
  uploadedBytes: number;
  totalBytes: number;
  storageUploaded: boolean;
}) {
  return !input.storageUploaded && input.uploadedBytes >= input.totalBytes;
}

type UploadEntry = {
  relativePath: string;
  file: Pick<File, "size" | "lastModified">;
};

export function dedupeUploadEntries<T extends UploadEntry>(current: readonly T[], additions: readonly T[]) {
  const known = new Set(current.map((entry) => `${entry.relativePath}:${entry.file.size}:${entry.file.lastModified}`));
  return additions.filter((entry) => {
    const identity = `${entry.relativePath}:${entry.file.size}:${entry.file.lastModified}`;
    if (known.has(identity)) return false;
    known.add(identity);
    return true;
  });
}

export function createConcurrencyLimiter(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Concurrency limit must be a positive integer.");
  let active = 0;
  const waiting: Array<() => void> = [];

  return {
    async acquire() {
      if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
        waiting.shift()?.();
      };
    },
  };
}

export function parseUploadAuthorization(value: unknown): UploadAuthorization | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.fileId !== "string" || !candidate.fileId
    || typeof candidate.path !== "string" || !candidate.path
    || typeof candidate.token !== "string" || !candidate.token
  ) return null;
  return { fileId: candidate.fileId, path: candidate.path, token: candidate.token };
}

export function buildUploadFingerprint(
  file: Pick<File, "name" | "size" | "type" | "lastModified">,
  bucket: string,
  path: string,
) {
  return ["mmoptibuilds-tus-v1", bucket, path, file.name, file.size, file.type, file.lastModified]
    .map((part) => encodeURIComponent(String(part)))
    .join(":");
}

export function uploadFailureMessage(error: unknown) {
  void error;
  return "This file could not continue. Select Retry to resume it or restart only this file.";
}

const defaultTusFactory: TusUploadFactory = (file, options) => {
  const upload = new Upload(file, options);
  return {
    findPreviousUploads: () => upload.findPreviousUploads(),
    resumeFromPreviousUpload: (previousUpload) => {
      upload.resumeFromPreviousUpload(previousUpload as unknown as Parameters<Upload["resumeFromPreviousUpload"]>[0]);
    },
    start: () => upload.start(),
    abort: (shouldTerminate) => upload.abort(shouldTerminate),
  };
};

export function createSignedTusUpload(
  input: SignedTusConfiguration & {
    file: File | Blob;
    onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  },
  factory: TusUploadFactory = defaultTusFactory,
) {
  let upload: TusUploadLike | null = null;
  let paused = false;
  let transfer: Promise<void> | null = null;
  let rejectTransfer: ((reason: unknown) => void) | null = null;

  return {
    start() {
      if (transfer) return transfer;
      transfer = new Promise<void>((resolve, reject) => {
        rejectTransfer = reject;
        upload = factory(input.file, {
          ...buildSignedTusOptions(input),
          fingerprint: async (file) => buildUploadFingerprint(file, input.bucket, input.authorization.path),
          onProgress: input.onProgress,
          onError: reject,
          onSuccess: () => resolve(),
        });

        void upload.findPreviousUploads().then((previousUploads) => {
          if (paused) throw new DOMException("Paused", "AbortError");
          if (previousUploads[0]) upload?.resumeFromPreviousUpload(previousUploads[0]);
          upload?.start();
        }).catch(reject);
      });
      return transfer;
    },

    async pause() {
      paused = true;
      await upload?.abort(false);
      rejectTransfer?.(new DOMException("Paused", "AbortError"));
    },
  };
}

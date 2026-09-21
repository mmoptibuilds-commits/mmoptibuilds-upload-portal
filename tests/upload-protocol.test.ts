import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as protocol from "../src/lib/upload-protocol.ts";

const authorization = {
  fileId: "file-123",
  path: "user-123/batch-123/folder/file.mov",
  token: "short-lived-upload-token",
};

describe("signed Supabase resumable upload protocol", () => {
  it("builds the direct production Storage TUS endpoint", () => {
    assert.equal(typeof protocol.buildStorageTusEndpoint, "function");
    assert.equal(
      protocol.buildStorageTusEndpoint("https://project-ref.supabase.co"),
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable",
    );
  });

  it("keeps local and custom Storage origins usable", () => {
    assert.equal(
      protocol.buildStorageTusEndpoint("http://127.0.0.1:54321/"),
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
  });

  it("rejects an invalid Storage origin", () => {
    assert.throws(() => protocol.buildStorageTusEndpoint("not a URL"), /Storage configuration is invalid/);
  });

  it("uses only the signed token and immutable server path in TUS options", () => {
    const options = protocol.buildSignedTusOptions({
      storageUrl: "https://project-ref.supabase.co",
      bucket: "client-uploads",
      authorization,
      contentType: "video/quicktime",
    });

    assert.deepEqual(options, {
      endpoint: "https://project-ref.storage.supabase.co/storage/v1/upload/resumable",
      headers: { "x-signature": "short-lived-upload-token" },
      metadata: {
        bucketName: "client-uploads",
        objectName: "user-123/batch-123/folder/file.mov",
        contentType: "video/quicktime",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
    });
    assert.equal("authorization" in options.headers, false);
    assert.equal("x-upsert" in options.headers, false);
  });

  it("builds the exact initialization and completion API bodies", () => {
    assert.deepEqual(protocol.buildUploadInitializationBody({
      batchId: "batch-123",
      relativePath: "folder/file.mov",
      size: 42,
      mimeType: "video/quicktime",
    }), {
      batchId: "batch-123",
      relativePath: "folder/file.mov",
      size: 42,
      mimeType: "video/quicktime",
    });
    assert.deepEqual(protocol.buildUploadCompletionBody("file-123"), { fileId: "file-123" });
  });

  it("accepts only complete upload authorization responses", () => {
    assert.deepEqual(protocol.parseUploadAuthorization(authorization), authorization);
    assert.equal(protocol.parseUploadAuthorization({ fileId: "file-123", path: authorization.path }), null);
    assert.equal(protocol.parseUploadAuthorization({ ...authorization, token: "" }), null);
    assert.equal(protocol.parseUploadAuthorization(null), null);
  });

  it("scopes resumable fingerprints to the immutable storage object", () => {
    const file = { name: "file.mov", size: 42, type: "video/quicktime", lastModified: 123 };
    const first = protocol.buildUploadFingerprint(file, "client-uploads", "user/batch-a/file.mov");
    const same = protocol.buildUploadFingerprint(file, "client-uploads", "user/batch-a/file.mov");
    const other = protocol.buildUploadFingerprint(file, "client-uploads", "user/batch-b/file.mov");

    assert.equal(first, same);
    assert.notEqual(first, other);
    assert.equal(first.includes(authorization.token), false);
  });

  it("probes completion before retrying a transport that reached the full file size", () => {
    assert.equal(protocol.shouldProbeUploadCompletion({ uploadedBytes: 42, totalBytes: 42, storageUploaded: false }), true);
    assert.equal(protocol.shouldProbeUploadCompletion({ uploadedBytes: 41, totalBytes: 42, storageUploaded: false }), false);
    assert.equal(protocol.shouldProbeUploadCompletion({ uploadedBytes: 42, totalBytes: 42, storageUploaded: true }), false);
  });

  it("deduplicates new paths against the existing queue and within one selection", () => {
    const current = [{ relativePath: "source/logo.svg", file: { size: 10, lastModified: 1 } }];
    const additions = [
      { relativePath: "source/logo.svg", file: { size: 10, lastModified: 1 } },
      { relativePath: "source/hero.svg", file: { size: 20, lastModified: 2 } },
      { relativePath: "source/hero.svg", file: { size: 20, lastModified: 2 } },
    ];

    assert.deepEqual(
      protocol.dedupeUploadEntries(current, additions).map((entry) => entry.relativePath),
      ["source/hero.svg"],
    );
  });

  it("keeps queued transfers at the configured concurrency limit", async () => {
    const limiter = protocol.createConcurrencyLimiter(1);
    const releaseFirst = await limiter.acquire();
    let secondAcquired = false;
    const second = limiter.acquire().then((release) => {
      secondAcquired = true;
      return release;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(secondAcquired, false);
    releaseFirst();
    const releaseSecond = await second;
    assert.equal(secondAcquired, true);
    releaseSecond();
  });

  it("resumes the previous TUS upload before starting", async () => {
    const events: string[] = [];
    const previous = { uploadUrl: "https://storage.test/resumable/previous" };
    const factory: protocol.TusUploadFactory = (_file, options) => ({
      findPreviousUploads: async () => [previous],
      resumeFromPreviousUpload: (upload) => events.push(`resume:${upload.uploadUrl}`),
      start: () => {
        events.push("start");
        options.onProgress?.(6, 10);
        options.onSuccess?.();
      },
      abort: async () => { events.push("abort"); },
    });
    const progress: Array<[number, number]> = [];
    const controller = protocol.createSignedTusUpload({
      file: new Blob(["0123456789"]),
      storageUrl: "https://project-ref.supabase.co",
      bucket: "client-uploads",
      authorization,
      contentType: "text/plain",
      onProgress: (uploaded, total) => progress.push([uploaded, total]),
    }, factory);

    await controller.start();

    assert.deepEqual(events, ["resume:https://storage.test/resumable/previous", "start"]);
    assert.deepEqual(progress, [[6, 10]]);
  });

  it("settles a paused transfer as AbortError without terminating its resumable URL", async () => {
    const events: string[] = [];
    const factory: protocol.TusUploadFactory = () => ({
      findPreviousUploads: async () => [],
      resumeFromPreviousUpload: () => { events.push("resume"); },
      start: () => { events.push("start"); },
      abort: async (terminate) => { events.push(`abort:${String(terminate)}`); },
    });
    const controller = protocol.createSignedTusUpload({
      file: new Blob(["data"]),
      storageUrl: "https://project-ref.supabase.co",
      bucket: "client-uploads",
      authorization,
      contentType: "application/octet-stream",
      onProgress: () => undefined,
    }, factory);

    const transfer = controller.start();
    await new Promise((resolve) => setImmediate(resolve));
    await controller.pause();

    await assert.rejects(transfer, (error) => error instanceof DOMException && error.name === "AbortError");
    assert.deepEqual(events, ["start", "abort:false"]);
  });

  it("maps transport failures to an actionable provider-neutral message", () => {
    assert.equal(
      protocol.uploadFailureMessage(new Error("HTTP 403 at https://secret.storage.example/token")),
      "This file could not continue. Select Retry to resume it or restart only this file.",
    );
  });
});

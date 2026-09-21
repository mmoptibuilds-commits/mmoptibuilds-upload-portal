import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createUploadCompletionOrchestrator,
  mapUploadCompletionResult,
  UploadCompletionError,
  type UploadCompletionDependencies,
  type UploadCompletionSnapshot,
} from "../src/lib/upload-completion.ts";

const snapshot: UploadCompletionSnapshot = {
  userId: "7e89105e-7a3a-4f48-93a7-60ab8bc4e548",
  username: "client-a",
  fileId: "3d711a0d-cd18-42a0-bfab-4b192b122a74",
  batchId: "d0a5484d-aa26-4c2f-9709-4f77bdb132c9",
  relativePath: "folder/file.txt",
  storagePath: "7e89105e-7a3a-4f48-93a7-60ab8bc4e548/d0a5484d-aa26-4c2f-9709-4f77bdb132c9/folder/file.txt",
  size: 42,
  mimeType: "text/plain",
  fileStatus: "uploading",
  batchStatus: "uploading",
};
const verification = {
  path: "7e89105e-7a3a-4f48-93a7-60ab8bc4e548/d0a5484d-aa26-4c2f-9709-4f77bdb132c9/folder/file.txt",
  size: snapshot.size,
  contentType: snapshot.mimeType,
  lastModified: "2026-09-21T00:01:00.000Z",
};
const notification = {
  batchId: snapshot.batchId,
  username: snapshot.username,
  fileCount: 1,
  totalBytes: 42,
  completedAt: new Date("2026-09-21T00:02:00.000Z"),
};

function setup(overrides: Partial<UploadCompletionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: UploadCompletionDependencies = {
    loadOwned: async () => { calls.push("load"); return snapshot; },
    verify: async () => { calls.push("verify"); return verification; },
    finalize: async () => { calls.push("finalize"); return { kind: "complete", transitioned: true, notification }; },
    notify: async () => { calls.push("notify"); return "sent"; },
    ...overrides,
  };
  return { calls, complete: createUploadCompletionOrchestrator(dependencies) };
}

describe("upload completion orchestration", () => {
  it("loads ownership, verifies the derived object, finalizes, then notifies", async () => {
    let verifiedInput: { userId: string; batchId: string; relativePath: string } | undefined;
    const task = setup({
      verify: async (input) => {
        task.calls.push("verify");
        verifiedInput = input;
        return verification;
      },
    });

    const result = await task.complete({ userId: snapshot.userId, username: snapshot.username, fileId: snapshot.fileId });

    assert.deepEqual(verifiedInput, {
      userId: snapshot.userId,
      batchId: snapshot.batchId,
      relativePath: snapshot.relativePath,
    });
    assert.deepEqual(task.calls, ["load", "verify", "finalize", "notify"]);
    assert.deepEqual(result, { kind: "complete", transitioned: true, notification, notificationStatus: "sent" });
  });

  it("does not inspect storage for an unavailable file", async () => {
    const task = setup({ loadOwned: async () => { task.calls.push("load"); return null; } });

    const result = await task.complete({ userId: snapshot.userId, username: snapshot.username, fileId: snapshot.fileId });

    assert.deepEqual(result, { kind: "unavailable" });
    assert.deepEqual(task.calls, ["load"]);
  });

  it("does not finalize metadata that differs from the immutable manifest", async () => {
    const task = setup({ verify: async () => { task.calls.push("verify"); return { ...verification, size: 43 }; } });

    const result = await task.complete({ userId: snapshot.userId, username: snapshot.username, fileId: snapshot.fileId });

    assert.deepEqual(result, { kind: "verification_mismatch" });
    assert.deepEqual(task.calls, ["load", "verify"]);
  });

  it("normalizes bounded provider verification failures for a safe retry", async () => {
    const task = setup({ verify: async () => { task.calls.push("verify"); throw new Error("private provider detail"); } });

    await assert.rejects(
      task.complete({ userId: snapshot.userId, username: snapshot.username, fileId: snapshot.fileId }),
      (error) => error instanceof UploadCompletionError && error.code === "verification_failed",
    );
    assert.deepEqual(task.calls, ["load", "verify"]);
  });

  it("skips provider verification for a repeated completed-file request", async () => {
    const task = setup({
      loadOwned: async () => { task.calls.push("load"); return { ...snapshot, fileStatus: "completed" }; },
      finalize: async (_snapshot, receivedVerification) => {
        task.calls.push("finalize");
        assert.equal(receivedVerification, null);
        return { kind: "complete", transitioned: false, notification };
      },
    });

    const result = await task.complete({ userId: snapshot.userId, username: snapshot.username, fileId: snapshot.fileId });

    assert.equal(result.kind, "complete");
    assert.deepEqual(task.calls, ["load", "finalize", "notify"]);
  });

  it("keeps a completed upload successful when optional notification delivery fails", async () => {
    const task = setup({ notify: async () => { task.calls.push("notify"); throw new Error("SMTP unavailable"); } });

    const result = await task.complete({ userId: snapshot.userId, username: snapshot.username, fileId: snapshot.fileId });

    assert.deepEqual(result, { kind: "complete", transitioned: true, notification, notificationStatus: "failed" });
    assert.deepEqual(mapUploadCompletionResult(result), {
      status: 200,
      body: { ok: true, batchComplete: true, notificationStatus: "failed" },
    });
  });

  it("normalizes database finalization failures without retry-unsafe side effects", async () => {
    const task = setup({ finalize: async () => { task.calls.push("finalize"); throw new Error("database detail"); } });

    await assert.rejects(
      task.complete({ userId: snapshot.userId, username: snapshot.username, fileId: snapshot.fileId }),
      (error) => error instanceof UploadCompletionError && error.code === "finalization_failed",
    );
    assert.deepEqual(task.calls, ["load", "verify", "finalize"]);
  });

  it("maps partial and unavailable outcomes to storage-neutral responses", () => {
    assert.deepEqual(mapUploadCompletionResult({ kind: "partial" }), {
      status: 200,
      body: { ok: true, batchComplete: false },
    });
    assert.deepEqual(mapUploadCompletionResult({ kind: "unavailable" }), {
      status: 404,
      body: { error: "Upload file not found." },
    });
    assert.deepEqual(mapUploadCompletionResult({ kind: "verification_mismatch" }), {
      status: 409,
      body: { error: "The uploaded object does not match the expected file." },
    });
  });
});

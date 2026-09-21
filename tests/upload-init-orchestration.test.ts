import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createUploadInitializationOrchestrator,
  isUploadBatchActiveStatus,
  mapUploadInitializationResult,
  parseUploadInitializationRequest,
  UploadInitializationError,
} from "../src/lib/upload-initialization.ts";

const input = {
  userId: "7e89105e-7a3a-4f48-93a7-60ab8bc4e548",
  batchId: "d0a5484d-aa26-4c2f-9709-4f77bdb132c9",
  relativePath: "folder/file.txt",
  fileName: "file.txt",
  size: 42,
  mimeType: "text/plain",
  storagePath: "7e89105e-7a3a-4f48-93a7-60ab8bc4e548/d0a5484d-aa26-4c2f-9709-4f77bdb132c9/folder/file.txt",
};
const authorization = { path: input.storagePath, token: "short-lived-token" };

function dependencies(overrides: Partial<Parameters<typeof createUploadInitializationOrchestrator>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    dependencies: {
      reserve: async () => {
        calls.push("reserve");
        return { kind: "reserved" as const, fileId: "file-123", isNew: true };
      },
      authorize: async () => {
        calls.push("authorize");
        return authorization;
      },
      finalize: async () => {
        calls.push("finalize");
        return { kind: "authorized" as const, fileId: "file-123", authorization };
      },
      markAuthorizationFailed: async () => {
        calls.push("mark-authorization-failed");
      },
      ...overrides,
    },
  };
}

describe("upload initialization orchestration", () => {
  it("requires an active batch before finalization can proceed", () => {
    assert.equal(isUploadBatchActiveStatus("queued"), true);
    assert.equal(isUploadBatchActiveStatus("uploading"), true);
    assert.equal(isUploadBatchActiveStatus("cancelled"), false);
    assert.equal(isUploadBatchActiveStatus("completed"), false);
    assert.equal(isUploadBatchActiveStatus("failed"), false);
  });

  it("runs reservation, provider authorization, and finalization in order", async () => {
    const setup = dependencies();
    const initialize = createUploadInitializationOrchestrator(setup.dependencies);

    const result = await initialize(input);

    assert.deepEqual(result, { kind: "authorized", fileId: "file-123", authorization });
    assert.deepEqual(setup.calls, ["reserve", "authorize", "finalize"]);
  });

  it("passes the authenticated ownership context into finalization", async () => {
    let finalizationInput: { userId: string; batchId: string } | undefined;
    const setup = dependencies({
      finalize: async (receivedInput, reservation, receivedAuthorization) => {
        finalizationInput = { userId: receivedInput.userId, batchId: receivedInput.batchId };
        setup.calls.push("finalize");
        return { kind: "authorized" as const, fileId: reservation.fileId, authorization: receivedAuthorization };
      },
    });
    const initialize = createUploadInitializationOrchestrator(setup.dependencies);

    await initialize(input);

    assert.deepEqual(finalizationInput, { userId: input.userId, batchId: input.batchId });
  });

  it("maps unavailable ownership results to a safe 404 without calling storage", async () => {
    const setup = dependencies({
      reserve: async () => {
        setup.calls.push("reserve");
        return { kind: "unavailable" as const };
      },
    });
    const initialize = createUploadInitializationOrchestrator(setup.dependencies);

    const result = await initialize(input);

    assert.deepEqual(mapUploadInitializationResult(result), {
      status: 404,
      body: { error: "This upload batch is unavailable." },
    });
    assert.deepEqual(setup.calls, ["reserve"]);
  });

  it("maps conflict and manifest-limit classifications to 409", () => {
    assert.deepEqual(mapUploadInitializationResult({ kind: "conflict" }), {
      status: 409,
      body: { error: "A different file is already queued at this path." },
    });
    assert.deepEqual(mapUploadInitializationResult({ kind: "limit" }), {
      status: 409,
      body: { error: "This file would exceed the batch manifest limit." },
    });
  });

  it("marks only a newly reserved row when provider authorization fails", async () => {
    const setup = dependencies({
      authorize: async () => {
        setup.calls.push("authorize");
        throw new Error("provider token must not escape");
      },
    });
    const initialize = createUploadInitializationOrchestrator(setup.dependencies);

    await assert.rejects(initialize(input), (error) => error instanceof UploadInitializationError && error.code === "authorization_failed");
    assert.deepEqual(setup.calls, ["reserve", "authorize", "mark-authorization-failed"]);
  });

  it("does not mark an existing row when renewed authorization fails", async () => {
    const setup = dependencies({
      reserve: async () => {
        setup.calls.push("reserve");
        return { kind: "reserved" as const, fileId: "file-123", isNew: false };
      },
      authorize: async () => {
        setup.calls.push("authorize");
        throw new Error("authorization expired");
      },
    });
    const initialize = createUploadInitializationOrchestrator(setup.dependencies);

    await assert.rejects(initialize(input), (error) => error instanceof UploadInitializationError && error.code === "authorization_failed");
    assert.deepEqual(setup.calls, ["reserve", "authorize"]);
  });

  it("separates database finalization failure from provider authorization failure", async () => {
    const setup = dependencies({
      finalize: async () => {
        setup.calls.push("finalize");
        throw new Error("database connection failed");
      },
    });
    const initialize = createUploadInitializationOrchestrator(setup.dependencies);

    await assert.rejects(initialize(input), (error) => error instanceof UploadInitializationError && error.code === "finalization_failed");
    assert.deepEqual(setup.calls, ["reserve", "authorize", "finalize"]);
  });

  it("maps a finalized ownership race to unavailable", () => {
    assert.deepEqual(mapUploadInitializationResult({ kind: "unavailable" }), {
      status: 404,
      body: { error: "This upload batch is unavailable." },
    });
  });

  it("treats malformed JSON as invalid metadata", async () => {
    const parsed = await parseUploadInitializationRequest({
      json: async () => { throw new SyntaxError("malformed JSON"); },
    });

    assert.deepEqual(parsed, { kind: "invalid" });
  });

  it("maps successful authorization to only the browser contract", () => {
    assert.deepEqual(mapUploadInitializationResult({ kind: "authorized", fileId: "file-123", authorization }), {
      status: 200,
      body: { fileId: "file-123", path: authorization.path, token: authorization.token },
    });
  });
});

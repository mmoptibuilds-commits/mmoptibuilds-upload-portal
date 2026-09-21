import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuthorizedUploadUpdate,
  buildSignedUploadResponse,
  buildUploadReservationValues,
  classifyUploadReservation,
  uploadInitializationRequestSchema,
} from "../src/lib/upload-initialization.ts";

const input = {
  batchId: "d0a5484d-aa26-4c2f-9709-4f77bdb132c9",
  relativePath: "folder/file.txt",
  fileName: "file.txt",
  size: 42,
  mimeType: "text/plain",
};
const storagePath = "7e89105e-7a3a-4f48-93a7-60ab8bc4e548/d0a5484d-aa26-4c2f-9709-4f77bdb132c9/folder/file.txt";

describe("signed upload initialization contract", () => {
  it("rejects legacy Drive authorization fields in the request", () => {
    const request = {
      batchId: input.batchId,
      relativePath: input.relativePath,
      size: input.size,
      mimeType: input.mimeType,
    };

    assert.equal(uploadInitializationRequestSchema.safeParse({ ...request, sessionUrl: "https://drive.test/session" }).success, false);
    assert.equal(uploadInitializationRequestSchema.safeParse({ ...request, driveFileId: "provider-id" }).success, false);
  });

  it("reserves a new storage row without legacy Drive authorization fields", () => {
    const values = buildUploadReservationValues(input, storagePath);

    assert.deepEqual(values, {
      batchId: input.batchId,
      relativePath: input.relativePath,
      fileName: input.fileName,
      size: input.size,
      mimeType: input.mimeType,
      status: "preparing",
      storagePath,
    });
    assert.equal("driveParentId" in values, false);
    assert.equal("driveFileId" in values, false);
    assert.equal("resumableSessionUrl" in values, false);
  });

  it("reuses one manifest row when immutable metadata and the derived path match", () => {
    assert.equal(
      classifyUploadReservation({
        ...input,
        id: "file-123",
        storagePath,
        status: "uploading",
      }, input, storagePath),
      "renew",
    );
  });

  it("rejects changed immutable metadata or a mismatched persisted path", () => {
    assert.equal(
      classifyUploadReservation({ ...input, id: "file-123", storagePath, status: "uploading", size: 43 }, input, storagePath),
      "conflict",
    );
    assert.equal(
      classifyUploadReservation({ ...input, id: "file-123", storagePath: "another/path", status: "uploading" }, input, storagePath),
      "conflict",
    );
  });

  it("does not renew or move a completed row backward", () => {
    assert.equal(
      classifyUploadReservation({
        ...input,
        id: "file-123",
        storagePath,
        status: "completed",
      }, input, storagePath),
      "completed",
    );
  });

  it("authorizes a reserved row without resetting completion metadata or storing authorization", () => {
    const update = buildAuthorizedUploadUpdate(storagePath);

    assert.deepEqual(update, {
      status: "uploading",
      storagePath,
      errorCategory: null,
    });
    assert.equal("completedBytes" in update, false);
    assert.equal("completedAt" in update, false);
    assert.equal("token" in update, false);
    assert.equal("signedUrl" in update, false);
  });

  it("returns only the verified browser upload contract", () => {
    assert.deepEqual(
      buildSignedUploadResponse("file-123", { path: storagePath, token: "short-lived-token" }),
      { fileId: "file-123", path: storagePath, token: "short-lived-token" },
    );
  });
});

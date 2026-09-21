import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveStorageObjectPath,
  normalizeStorageRelativePath,
} from "../src/lib/storage-path.ts";
import {
  createStorageOperations,
  StorageOperationError,
} from "../src/lib/storage-operations.ts";

const userId = "7e89105e-7a3a-4f48-93a7-60ab8bc4e548";
const batchId = "d0a5484d-aa26-4c2f-9709-4f77bdb132c9";

describe("storage object paths", () => {
  it("normalizes Windows separators into the exact owned object path", () => {
    assert.equal(
      deriveStorageObjectPath(userId, batchId, "folder\\nested\\file.txt"),
      `${userId}/${batchId}/folder/nested/file.txt`,
    );
  });

  it("normalizes Unicode file names to NFC without removing valid characters", () => {
    assert.equal(
      normalizeStorageRelativePath("résumé/写真 📷.png"),
      "résumé/写真 📷.png",
    );
  });

  for (const path of ["../secret.txt", "folder/../secret.txt", "./file.txt", "folder/./file.txt"]) {
    it(`rejects traversal segment ${JSON.stringify(path)}`, () => {
      assert.throws(() => normalizeStorageRelativePath(path), /invalid/i);
    });
  }

  for (const path of ["/etc/passwd", "\\server\\share.txt", "C:\\secret.txt", "C:/secret.txt"]) {
    it(`rejects absolute path ${JSON.stringify(path)}`, () => {
      assert.throws(() => normalizeStorageRelativePath(path), /invalid/i);
    });
  }

  for (const path of ["folder//file.txt", "folder\\\\file.txt", "folder/", "/file.txt"]) {
    it(`rejects empty path segments in ${JSON.stringify(path)}`, () => {
      assert.throws(() => normalizeStorageRelativePath(path), /invalid/i);
    });
  }

  for (const path of ["", "\0file.txt", "folder/line\nbreak.txt", "folder/del\u007f.txt", "folder/c1\u0085.txt"]) {
    it(`rejects empty or control-bearing path ${JSON.stringify(path)}`, () => {
      assert.throws(() => normalizeStorageRelativePath(path), /invalid/i);
    });
  }

  it("rejects an object key longer than 1024 UTF-8 bytes", () => {
    assert.throws(
      () => deriveStorageObjectPath(userId, batchId, `folder/${"é".repeat(480)}.txt`),
      /too long/i,
    );
  });

  it("rejects identifiers that could escape the ownership prefix", () => {
    assert.throws(
      () => deriveStorageObjectPath(`${userId}/other`, batchId, "file.txt"),
      /invalid/i,
    );
    assert.throws(
      () => deriveStorageObjectPath(userId, "../other", "file.txt"),
      /invalid/i,
    );
  });
});

type SignedResult =
  | { data: { signedUrl: string; token: string; path: string }; error: null }
  | { data: null; error: Error };
type InfoResult =
  | {
      data: {
        id: string;
        version: string;
        name: string;
        bucketId: string;
        createdAt: string;
        size?: number;
        contentType?: string;
        lastModified?: string;
        etag?: string;
      };
      error: null;
    }
  | { data: null; error: Error };

function fakeBucket(overrides: {
  signed?: (path: string, options: { upsert: boolean }) => Promise<SignedResult>;
  info?: (path: string) => Promise<InfoResult>;
} = {}) {
  const calls = { signed: [] as Array<[string, { upsert: boolean }]>, info: [] as string[] };
  return {
    calls,
    api: {
      async createSignedUploadUrl(path: string, options: { upsert: boolean }) {
        calls.signed.push([path, options]);
        return overrides.signed
          ? overrides.signed(path, options)
          : {
              data: { signedUrl: `https://storage.test/upload?token=private-token`, token: "private-token", path },
              error: null,
            };
      },
      async info(path: string) {
        calls.info.push(path);
        return overrides.info
          ? overrides.info(path)
          : {
              data: {
                id: "provider-object-id",
                version: "provider-version",
                name: path,
                bucketId: "private-bucket",
                createdAt: "2026-09-21T00:00:00.000Z",
                size: 42,
                contentType: "text/plain",
                lastModified: "2026-09-21T00:01:00.000Z",
                etag: "provider-etag",
              },
              error: null,
            };
      },
    },
  };
}

describe("bounded storage operations", () => {
  it("issues a non-upsert signed authorization only for the derived owned path", async () => {
    const bucket = fakeBucket();
    const storage = createStorageOperations(bucket.api, 50);

    const result = await storage.createSignedUploadAuthorization({
      userId,
      batchId,
      relativePath: "folder\\file.txt",
    });

    const path = `${userId}/${batchId}/folder/file.txt`;
    assert.deepEqual(result, { path, token: "private-token" });
    assert.deepEqual(bucket.calls.signed, [[path, { upsert: false }]]);
    assert.equal(JSON.stringify(result).includes("signedUrl"), false);
  });

  it("returns only manifest-relevant metadata from object verification", async () => {
    const bucket = fakeBucket();
    const storage = createStorageOperations(bucket.api, 50);

    const result = await storage.verifyStorageObject({ userId, batchId, relativePath: "file.txt" });

    const path = `${userId}/${batchId}/file.txt`;
    assert.deepEqual(bucket.calls.info, [path]);
    assert.deepEqual(result, {
      path,
      size: 42,
      contentType: "text/plain",
      lastModified: "2026-09-21T00:01:00.000Z",
    });
    assert.equal(JSON.stringify(result).includes("provider-object-id"), false);
    assert.equal(JSON.stringify(result).includes("provider-etag"), false);
  });

  it("rejects an escaping path before the metadata API can inspect it", async () => {
    const bucket = fakeBucket();
    const storage = createStorageOperations(bucket.api, 50);

    await assert.rejects(
      storage.verifyStorageObject({ userId, batchId, relativePath: "../../another-user/file.txt" }),
      /invalid/i,
    );
    assert.deepEqual(bucket.calls.info, []);
  });

  it("bounds signed-upload authorization calls", async () => {
    const bucket = fakeBucket({ signed: () => new Promise(() => undefined) });
    const storage = createStorageOperations(bucket.api, 5);

    await assert.rejects(
      storage.createSignedUploadAuthorization({ userId, batchId, relativePath: "file.txt" }),
      (error) =>
        error instanceof StorageOperationError &&
        error.code === "timeout" &&
        error.message === "Storage upload authorization timed out.",
    );
  });

  it("bounds metadata verification calls", async () => {
    const bucket = fakeBucket({ info: () => new Promise(() => undefined) });
    const storage = createStorageOperations(bucket.api, 5);

    await assert.rejects(
      storage.verifyStorageObject({ userId, batchId, relativePath: "file.txt" }),
      (error) =>
        error instanceof StorageOperationError &&
        error.code === "timeout" &&
        error.message === "Storage object verification timed out.",
    );
  });

  it("normalizes provider authorization errors without leaking their message or token", async () => {
    const bucket = fakeBucket({
      signed: async () => ({ data: null, error: new Error("provider failed with private-token") }),
    });
    const storage = createStorageOperations(bucket.api, 50);

    await assert.rejects(
      storage.createSignedUploadAuthorization({ userId, batchId, relativePath: "file.txt" }),
      (error) =>
        error instanceof StorageOperationError &&
        error.code === "authorization_failed" &&
        error.message === "Storage upload authorization failed.",
    );
  });

  it("rejects a provider response for a different object path", async () => {
    const bucket = fakeBucket({
      signed: async () => ({
        data: {
          signedUrl: "https://storage.test/upload?token=private-token",
          token: "private-token",
          path: "another-user/another-batch/file.txt",
        },
        error: null,
      }),
    });
    const storage = createStorageOperations(bucket.api, 50);

    await assert.rejects(
      storage.createSignedUploadAuthorization({ userId, batchId, relativePath: "file.txt" }),
      (error) => error instanceof StorageOperationError && error.code === "invalid_response",
    );
  });

  it("normalizes provider metadata errors without exposing provider details", async () => {
    const bucket = fakeBucket({
      info: async () => ({ data: null, error: new Error("bucket private-bucket denied") }),
    });
    const storage = createStorageOperations(bucket.api, 50);

    await assert.rejects(
      storage.verifyStorageObject({ userId, batchId, relativePath: "file.txt" }),
      (error) =>
        error instanceof StorageOperationError &&
        error.code === "verification_failed" &&
        error.message === "Storage object verification failed.",
    );
  });
});

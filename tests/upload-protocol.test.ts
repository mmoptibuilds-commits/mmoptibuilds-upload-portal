import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidChunkSize, nextOffset, retryDelay, uploadChunks } from "../src/lib/upload-protocol.ts";
const CHUNK_SIZE = 8 * 1024 * 1024;
describe("Drive resumable protocol helpers", () => {
  it("uses a Drive-compliant chunk size", () => assert.equal(isValidChunkSize(CHUNK_SIZE), true));
  it("uses the server-confirmed range", () => assert.equal(nextOffset("bytes=0-8388607", 0), 8388608));
  it("backs off but remains bounded", () => assert.equal(retryDelay(10), 16000));
  it("does not overshoot final chunks", () => assert.deepEqual(uploadChunks(CHUNK_SIZE + 7, CHUNK_SIZE), [[0, CHUNK_SIZE], [CHUNK_SIZE, CHUNK_SIZE + 7]]));
});

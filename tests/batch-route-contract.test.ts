import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBatchInsertValues } from "../src/lib/batch-metadata.ts";

describe("batch creation storage contract", () => {
  it("builds queued metadata owned by the authenticated user", () => {
    const values = buildBatchInsertValues({ userId: "user-123", displayName: "Release archive", fileCount: 4, totalBytes: 12_345 });

    assert.deepEqual(values, {
      userId: "user-123",
      displayName: "Release archive",
      fileCount: 4,
      totalBytes: 12_345,
      status: "queued",
    });
    assert.equal("driveFolderId" in values, false);
    assert.equal("startedAt" in values, false);
  });
});

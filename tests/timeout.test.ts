import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchWithTimeout, promiseWithTimeout, TimeoutError } from "../src/lib/async-timeouts.ts";

describe("bounded backend network helpers", () => {
  it("rejects slow promises with a labeled timeout error", async () => {
    await assert.rejects(
      promiseWithTimeout(new Promise(() => undefined), 5, "SMTP delivery"),
      (error) => error instanceof TimeoutError && error.message === "SMTP delivery timed out after 5ms.",
    );
  });

  it("aborts slow fetches instead of waiting for the remote service forever", async () => {
    const originalFetch = globalThis.fetch;
    let receivedSignal: AbortSignal | undefined;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    try {
      await assert.rejects(
        fetchWithTimeout("https://storage.example.test/objects", {}, 5, "Storage metadata"),
        (error) => error instanceof TimeoutError && error.message === "Storage metadata timed out after 5ms.",
      );
      assert.equal(receivedSignal?.aborted, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

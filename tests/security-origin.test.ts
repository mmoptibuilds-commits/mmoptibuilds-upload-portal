import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSameOriginRequest } from "../src/lib/security.ts";

function request(headers: Record<string, string> = {}, url = "https://portal.example.test/api/action") {
  return new Request(url, { headers });
}

describe("state-changing request origin checks", () => {
  it("accepts a matching browser origin", () => {
    assert.equal(isSameOriginRequest(request({ origin: "https://portal.example.test" })), true);
  });

  it("rejects a different or malformed origin", () => {
    assert.equal(isSameOriginRequest(request({ origin: "https://evil.example.test" })), false);
    assert.equal(isSameOriginRequest(request({ origin: "not-an-origin" })), false);
  });

  it("rejects explicit cross-site fetch metadata", () => {
    assert.equal(isSameOriginRequest(request({ "sec-fetch-site": "cross-site" })), false);
  });

  it("allows origin-less non-browser requests", () => {
    assert.equal(isSameOriginRequest(request()), true);
  });
});

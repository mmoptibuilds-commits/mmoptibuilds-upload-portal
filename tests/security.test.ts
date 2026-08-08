import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeRedirect, safeRelativePath } from "../src/lib/security.ts";
describe("path and redirect safety", () => {
  it("keeps valid Unicode hierarchy", () => assert.equal(safeRelativePath("Website Assets/फ़ोटो/hero image.png"), "Website Assets/फ़ोटो/hero image.png"));
  it("rejects traversal paths", () => assert.throws(() => safeRelativePath("client/../../secret")));
  it("rejects external redirects", () => assert.equal(safeRedirect("//attacker.example"), "/upload"));
  it("allows a local redirect", () => assert.equal(safeRedirect("/history"), "/history"));
});

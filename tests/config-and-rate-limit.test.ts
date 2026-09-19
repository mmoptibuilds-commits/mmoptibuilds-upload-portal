import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEnv } from "../src/lib/env.ts";
import { checkLoginRateLimit, recordLoginFailure } from "../src/lib/rate-limit.ts";

describe("production configuration and login defenses", () => {
  it("accepts blank optional SMTP values and normalizes the private key", () => {
    const keys = ["DATABASE_URL", "AUTH_SECRET", "GOOGLE_PROJECT_ID", "GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_DRIVE_ROOT_FOLDER_ID", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "NOTIFICATION_EMAIL"];
    const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      DATABASE_URL: "https://db.example.test/connection",
      AUTH_SECRET: "a".repeat(32),
      GOOGLE_PROJECT_ID: "mmoptibuilds",
      GOOGLE_CLIENT_EMAIL: "upload@example.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: "line-one\\nline-two",
      GOOGLE_DRIVE_ROOT_FOLDER_ID: "drive-root",
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      SMTP_FROM: "",
      NOTIFICATION_EMAIL: "",
    });
    try {
      const env = getEnv();
      assert.equal(env.SMTP_USER, undefined);
      assert.equal(env.SMTP_FROM, undefined);
      assert.equal(env.SMTP_PORT, undefined);
      assert.equal(env.NOTIFICATION_EMAIL, "mmoptibuilds@gmail.com");
      assert.equal(env.GOOGLE_PRIVATE_KEY, "line-one\nline-two");
    } finally {
      for (const key of keys) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
    }
  });

  it("blocks repeated failures per account and address", () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const username = `rate-limit-${Date.now()}-${Math.random()}`;
    assert.equal(checkLoginRateLimit(ip, username).allowed, true);
    for (let attempt = 0; attempt < 10; attempt += 1) recordLoginFailure(ip, username);
    const result = checkLoginRateLimit(ip, username);
    assert.equal(result.allowed, false);
    assert.ok(result.retryAfter > 0);
  });
});

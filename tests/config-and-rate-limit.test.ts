import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { postgresRuntimeOptions } from "../src/lib/db/index.ts";
import { getEnv } from "../src/lib/env.ts";
import { getOptionalConfig } from "../src/lib/env.ts";
import { checkLoginRateLimit, recordLoginFailure } from "../src/lib/rate-limit.ts";

describe("production configuration and login defenses", () => {
  it("accepts Supabase storage configuration without legacy provider credentials", () => {
    const keys = ["DATABASE_URL", "AUTH_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "NOTIFICATION_EMAIL"];
    const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      DATABASE_URL: "https://db.example.test/connection",
      AUTH_SECRET: "a".repeat(32),
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      SUPABASE_STORAGE_BUCKET: "client-uploads",
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
      assert.equal(env.SUPABASE_STORAGE_BUCKET, "client-uploads");
    } finally {
      for (const key of keys) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
    }
  });

  it("reports storage readiness without exposing environment values", () => {
    const before = { ...process.env };
    Object.assign(process.env, {
      DATABASE_URL: "https://db.example.test/connection",
      AUTH_SECRET: "a".repeat(32),
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role-key",
      SUPABASE_STORAGE_BUCKET: "client-uploads",
    });
    try {
      const config = getOptionalConfig();
      assert.equal(config.storage, true);
      assert.equal(JSON.stringify(config).includes("super-secret-service-role-key"), false);
    } finally {
      process.env = before;
    }
  });

  it("keeps the service-role module out of client components", async () => {
    const componentFiles = ["src/components/app-shell.tsx", "src/components/upload-workspace.tsx", "src/components/admin-users.tsx", "src/components/ui.tsx"];
    const source = (await Promise.all(componentFiles.map((file) => readFile(file, "utf8")))).join("\n");
    assert.equal(/supabase-server|SUPABASE_SERVICE_ROLE_KEY|createClient/.test(source), false);
  });

  it("rejects incomplete Supabase storage configuration with precise fields", () => {
    const before = { ...process.env };
    Object.assign(process.env, { DATABASE_URL: "https://db.example.test/connection", AUTH_SECRET: "a".repeat(32), SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_STORAGE_BUCKET: "" });
    try {
      assert.throws(() => getEnv(), /SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET/);
    } finally {
      process.env = before;
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

  it("configures postgres-js for fast serverless failure and bounded sessions", () => {
    const options = postgresRuntimeOptions();
    assert.equal(options.prepare, false);
    assert.equal(options.max, 1);
    assert.equal(options.ssl, "require");
    assert.equal(options.connect_timeout, 5);
    assert.equal(options.idle_timeout, 20);
    assert.equal(options.connection.idle_in_transaction_session_timeout, 15_000);
    assert.equal(options.connection.statement_timeout, 60_000);
    assert.equal(options.connection.lock_timeout, 10_000);
  });
});

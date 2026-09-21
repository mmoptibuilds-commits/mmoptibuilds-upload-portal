import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;
let client: ReturnType<typeof postgres> | undefined;

export function postgresRuntimeOptions() {
  return {
    prepare: false,
    max: 1,
    ssl: "require" as const,
    connect_timeout: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 10,
    connection: {
      idle_in_transaction_session_timeout: 15_000,
      statement_timeout: 60_000,
      lock_timeout: 10_000,
      application_name: "mmoptibuilds-upload-portal",
    },
  };
}

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Add it to .env.local.");
  if (!cached) {
    // Supabase's shared pooler is IPv4-compatible and is the right choice
    // for Vercel/serverless runtimes. Keep one connection per warm instance
    // and require TLS for every database connection.
    client = postgres(process.env.DATABASE_URL, postgresRuntimeOptions());
    cached = drizzle(client, { schema });
  }
  return cached;
}

export async function closeDb() {
  if (!client) return;
  const activeClient = client;
  client = undefined;
  cached = undefined;
  await activeClient.end({ timeout: 5 });
}

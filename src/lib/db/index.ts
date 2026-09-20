import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;
let client: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Add it to .env.local.");
  if (!cached) {
    // Supabase's shared pooler is IPv4-compatible and is the right choice
    // for Vercel/serverless runtimes. Keep one connection per warm instance
    // and require TLS for every database connection.
    client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, ssl: "require" });
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

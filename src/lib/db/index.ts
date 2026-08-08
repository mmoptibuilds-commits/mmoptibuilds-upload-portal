import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Add it to .env.local.");
  if (!cached) {
    const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 5 });
    cached = drizzle(client, { schema });
  }
  return cached;
}

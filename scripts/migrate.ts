import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Add it to .env.local before migrating.");
const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, ssl: "require", connect_timeout: 10 });

async function closeCliDatabase() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    client.end({ timeout: 5 }),
    new Promise<void>((resolve) => { timeout = setTimeout(resolve, 6_000); }),
  ]);
  if (timeout) clearTimeout(timeout);
}

try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("Database migrations completed.");
} finally {
  await closeCliDatabase();
}

process.exit(0);

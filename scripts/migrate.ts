import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Add it to .env.local before migrating.");
const client = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Database migrations completed.");

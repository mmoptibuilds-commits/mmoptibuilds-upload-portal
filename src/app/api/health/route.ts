import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getOptionalConfig } from "@/lib/env";
export async function GET() {
  const config = getOptionalConfig(); let database = "not_configured";
  if (config.database) { try { await db().execute(sql`select 1`); database = "ok"; } catch { database = "error"; } }
  return NextResponse.json({ application: "ok", database, driveConfiguration: config.drive ? "configured" : "missing", emailConfiguration: config.email ? "configured" : "not_configured" }, { status: database === "error" ? 503 : 200 });
}

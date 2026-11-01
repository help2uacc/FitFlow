import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, getSqlite } from "@/db/client";
import * as t from "@/db/schema";

export const dynamic = "force-dynamic";

/** Liveness/readiness: DB reachable + worker heartbeat recency. No private data. */
export function GET() {
  try {
    const db = getDb();
    getSqlite().prepare("select 1").get();
    const hb = db.select().from(t.systemStatus).where(eq(t.systemStatus.key, "worker_heartbeat")).get();
    const at = (hb?.value as { at?: number } | undefined)?.at ?? 0;
    const workerOk = Date.now() - at < 60_000;
    return NextResponse.json({ status: "ok", db: "ok", worker: workerOk ? "ok" : "stale", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error", db: "error" }, { status: 503 });
  }
}

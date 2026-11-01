import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { registrationOpen, userCount } from "@/domain/auth/service";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export function GET() {
  const db = getDb();
  return NextResponse.json({ registrationOpen: registrationOpen(db, env().ALLOW_REGISTRATION), hasUsers: userCount(db) > 0 }, { headers: { "Cache-Control": "no-store" } });
}

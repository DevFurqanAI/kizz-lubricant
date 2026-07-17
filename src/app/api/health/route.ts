import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// Lightweight, unauthenticated DB warm-up. The login page pings this on mount,
// so Neon's serverless compute resumes from its cold-start *while the user is
// typing credentials* — the penalty is paid during dead time, not on the first
// real page. One trivial round-trip, no tables touched.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

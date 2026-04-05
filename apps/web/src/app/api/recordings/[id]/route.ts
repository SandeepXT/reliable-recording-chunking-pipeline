import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { recordings } from "@my-better-t-app/db/schema";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  const { id } = await params;
  try {
    const db = getDb();
    const [recording] = await db.select().from(recordings).where(eq(recordings.id, id));
    if (!recording) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(recording);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

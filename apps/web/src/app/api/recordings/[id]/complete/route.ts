import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { recordings } from "@my-better-t-app/db/schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  const { id } = await params;
  try {
    const db = getDb();
    const [updated] = await db
      .update(recordings)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(recordings.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, recording: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

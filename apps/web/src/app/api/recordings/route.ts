import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { requireAuth } from "@/lib/server/auth";
import { recordings } from "@my-better-t-app/db/schema";

const createSchema = z.object({ name: z.string().min(1).max(200) });

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const all = await db.select().from(recordings).orderBy(desc(recordings.createdAt));
    return NextResponse.json(all);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });

    const db = getDb();
    const [recording] = await db.insert(recordings).values({ name: parsed.data.name }).returning();
    return NextResponse.json({ ok: true, recording }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

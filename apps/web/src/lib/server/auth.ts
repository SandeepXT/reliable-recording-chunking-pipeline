import { NextRequest, NextResponse } from "next/server";

export function requireAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;

  // Dev bypass when no secret configured
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Server misconfigured: API_SECRET not set" },
        { status: 500 }
      );
    }
    return null; // allow through in dev
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return NextResponse.json(
      { error: "Missing or malformed Authorization header" },
      { status: 401 }
    );
  }

  if (token.length !== secret.length) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // authenticated
}

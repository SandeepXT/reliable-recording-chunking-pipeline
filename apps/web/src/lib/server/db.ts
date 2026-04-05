import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@my-better-t-app/db/schema";

// Lazy singleton — reuses connection across warm invocations
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = drizzle(url, { schema });
  }
  return _db;
}

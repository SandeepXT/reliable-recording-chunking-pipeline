import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(url?: string) {
  const databaseUrl = url ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  return drizzle(databaseUrl, { schema });
}

export const db = createDb();

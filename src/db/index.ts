import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing — .env file check karein.");
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

// Lazy proxy: pehli query par hi connect hota hai (build time par nahi)
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    if (!_db) _db = createDb();
    return (_db as never)[prop];
  },
});

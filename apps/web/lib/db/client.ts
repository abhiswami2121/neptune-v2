import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleClient | null = null;

// Use NEPTUNE_V2_POSTGRES_URL first (canonical V2 DB), fall back to POSTGRES_URL
const DB_URL = process.env.NEPTUNE_V2_POSTGRES_URL || process.env.POSTGRES_URL || "";

export const db = new Proxy({} as DrizzleClient, {
  get(_, prop) {
    if (!_db) {
      if (!DB_URL) {
        throw new Error("NEPTUNE_V2_POSTGRES_URL or POSTGRES_URL environment variable is required");
      }
      const client = postgres(DB_URL);
      _db = drizzle(client, { schema });
    }
    return Reflect.get(_db, prop);
  },
});

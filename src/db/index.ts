import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./vocab.schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

/** Create a fresh db connection per request (required for Workers I/O isolation). */
export function getDb() {
  const client = postgres(DATABASE_URL, { max: 1, idle_timeout: 20 });
  return drizzle(client, { schema });
}

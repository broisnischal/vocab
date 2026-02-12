import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../db";
import { embedText, vectorToSql } from "../../embedding";
import { sql } from "drizzle-orm";

export const searchRoutes = new Hono();

const searchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).default(10),
  level: z.string().optional(),
});

searchRoutes.post("/", async (c) => {
  const body = searchSchema.parse(await c.req.json());

  const qVec = embedText(body.query);
  const qVecSql = vectorToSql(qVec);

  const db = getDb();
  // cosine distance ordering — smaller = more similar
  const rows = await db.execute(sql`
    SELECT
      id, word, pos, level, definition, examples, synonyms,
      (embedding <=> ${sql.raw(`'${qVecSql}'::vector`)}) AS distance
    FROM vocab
    WHERE embedding IS NOT NULL
    ${body.level ? sql`AND level = ${body.level}` : sql``}
    ORDER BY embedding <=> ${sql.raw(`'${qVecSql}'::vector`)}
    LIMIT ${body.topK};
  `);

  return c.json({ ok: true, results: rows });
});

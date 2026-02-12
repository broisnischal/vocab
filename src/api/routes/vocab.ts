import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../db";
import { vocab } from "../../db/vocab.schema";
import { embedText, vectorToSql } from "../../embedding";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const vocabRoutes = new Hono();

const createSchema = z.object({
  word: z.string().min(1),
  pos: z.string().optional(),
  level: z.string().optional(),
  definition: z.string().optional(),
  examples: z.array(z.string()).optional(),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
});

vocabRoutes.post("/", async (c) => {
  const body = createSchema.parse(await c.req.json());

  const blob = [
    `word: ${body.word}`,
    body.pos ? `pos: ${body.pos}` : "",
    body.level ? `level: ${body.level}` : "",
    body.definition ? `definition: ${body.definition}` : "",
    body.examples?.length ? `examples: ${body.examples.join(" | ")}` : "",
    body.synonyms?.length ? `synonyms: ${body.synonyms.join(", ")}` : "",
    body.antonyms?.length ? `antonyms: ${body.antonyms.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const vec = embedText(blob);
  const vecSql = vectorToSql(vec);

  const db = getDb();
  const [row] = await db
    .insert(vocab)
    .values({
      word: body.word.toLowerCase().trim(),
      pos: body.pos,
      level: body.level,
      definition: body.definition,
      examples: body.examples ?? [],
      synonyms: body.synonyms ?? [],
      antonyms: body.antonyms ?? [],
      embedding: sql`${vecSql}::vector`,
    })
    .returning();

  return c.json({ ok: true, vocab: row }, 201);
});

vocabRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = await db.query.vocab.findFirst({
    where: eq(vocab.id, id),
  });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true, vocab: row });
});

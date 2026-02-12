import { Hono } from "hono";
import { getDb } from "../../db";
import { sql } from "drizzle-orm";
import { embedText, vectorToSql } from "../../embedding";

export const graphRoutes = new Hono();

graphRoutes.get("/", async (c) => {
  const word = (c.req.query("word") ?? "").toLowerCase().trim();
  if (!word) return c.json({ ok: false, error: "word is required" }, 400);

  const db = getDb();

  // 1) Find the center word if it exists
  const centerRes = await db.execute(sql`
    SELECT id, word, pos, level, definition, examples, synonyms, embedding::text
    FROM vocab
    WHERE word = ${word}
    LIMIT 1;
  `);

  const center = (centerRes as any[])[0];

  // If center doesn't exist, still build a graph from query embedding
  const qVec = center?.embedding ? null : embedText(`word: ${word}`);
  const qVecSql = qVec ? vectorToSql(qVec) : null;

  // 2) Neighbors by embedding similarity
  const neighborsRes = center?.embedding
    ? await db.execute(sql`
        SELECT id, word, pos, level, definition, examples, synonyms,
               (embedding <=> ${sql.raw(`'${center.embedding}'::vector`)}) AS distance
        FROM vocab
        WHERE embedding IS NOT NULL AND word <> ${word}
        ORDER BY embedding <=> ${sql.raw(`'${center.embedding}'::vector`)}
        LIMIT 18;
      `)
    : await db.execute(sql`
        SELECT id, word, pos, level, definition, examples, synonyms,
               (embedding <=> ${sql.raw(`'${qVecSql}'::vector`)}) AS distance
        FROM vocab
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${sql.raw(`'${qVecSql}'::vector`)}
        LIMIT 18;
      `);

  const neighbors = neighborsRes as any[];

  // 3) Build nodes
  const centerId = center?.id ?? `q:${word}`;
  const nodes = [
    {
      id: centerId,
      label: word,
      kind: "center",
      level: center?.level ?? null,
    },
    ...neighbors.map((n: any) => ({
      id: n.id,
      label: n.word,
      kind: "related",
      level: n.level ?? null,
      score: Number(n.distance),
    })),
  ];

  // 4) Build edges: center -> each neighbor
  const edges: any[] = neighbors.map((n: any) => ({
    source: centerId,
    target: n.id,
    weight: 1 / (1 + Number(n.distance)),
    type: "related",
  }));

  // Add synonym edges if center has synonyms stored
  if (center?.synonyms?.length) {
    const syns =
      typeof center.synonyms === "string"
        ? JSON.parse(center.synonyms)
        : center.synonyms;

    for (const s of syns as string[]) {
      const synId = `syn:${s.toLowerCase()}`;
      edges.push({
        source: centerId,
        target: synId,
        weight: 1,
        type: "synonym",
      });
      nodes.push({
        id: synId,
        label: s,
        kind: "synonym",
        level: null,
      });
    }
  }

  return c.json({
    ok: true,
    center: { id: centerId, word },
    nodes,
    edges,
  });
});

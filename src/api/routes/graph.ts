import { Hono } from "hono";
import { getDb } from "../../db";
import { sql } from "drizzle-orm";

export const graphRoutes = new Hono();

// ── Types ────────────────────────────────────────────────────────────────────

interface DatamuseWord {
  word: string;
  score: number;
  tags?: string[];
}

interface ParsedWord {
  word: string;
  pos: string;
  score: number;
  freq: number;
  isSyn: boolean;
}

interface ClassifiedWord extends ParsedWord {
  relation: "synonym" | "antonym" | "related";
}

// ── Constants ────────────────────────────────────────────────────────────────

const POS_TAG_MAP: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
};

const MAX_SYN_PER_POS = 12;
const MAX_ANT_PER_POS = 8;
const MAX_REL_PER_POS = 6;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a Datamuse result:
 * - extract POS from tags (n, v, adj, adv)
 * - extract frequency from "f:XX.XX" tag
 * - detect "syn" tag
 */
function parseDatamuseWord(item: DatamuseWord): ParsedWord {
  let pos = "other";
  let freq = 0;
  let isSyn = false;

  for (const tag of item.tags ?? []) {
    if (POS_TAG_MAP[tag] && pos === "other") {
      pos = POS_TAG_MAP[tag];
    } else if (tag.startsWith("f:")) {
      freq = parseFloat(tag.slice(2)) || 0;
    } else if (tag === "syn") {
      isSyn = true;
    }
  }

  return { word: item.word, pos, score: item.score, freq, isSyn };
}

/** Fetch from Datamuse API with frequency + POS metadata. */
async function datamuse(params: string): Promise<DatamuseWord[]> {
  try {
    const res = await fetch(
      `https://api.datamuse.com/words?${params}&md=fp`
    );
    if (!res.ok) return [];
    return (await res.json()) as DatamuseWord[];
  } catch (_e) {
    return [];
  }
}

function escLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

function pgArrayLiteral(labels: string[]): string {
  if (!labels.length) return "ARRAY[]::text[]";
  const escaped = labels.map((s) => `'${escLiteral(s)}'`);
  return `ARRAY[${escaped.join(",")}]`;
}

// ── Graph endpoint ───────────────────────────────────────────────────────────

graphRoutes.get("/", async (c) => {
  const word = (c.req.query("word") ?? "").toLowerCase().trim();
  if (!word) return c.json({ ok: false, error: "word is required" }, 400);

  const db = getDb();
  const encoded = encodeURIComponent(word);

  // ── 1. Parallel fetch: Datamuse (ml + antonyms) + DB ──────────────────
  //
  //  ml={word}   → similar-meaning words, tagged "syn" if true synonym
  //  rel_ant=    → antonyms
  //  DB          → stored metadata (definition, level, examples)

  const [mlRaw, antRaw, centerDbRows] = await Promise.all([
    datamuse(`ml=${encoded}&max=50`),
    datamuse(`rel_ant=${encoded}&max=20`),
    db
      .execute(
        sql`SELECT id, word, pos, level, definition, examples, synonyms, antonyms
            FROM vocab WHERE word = ${word};`
      )
      .then((r) => r as any[]),
  ]);

  const bestCenter = centerDbRows[0] ?? null;
  const centerId = bestCenter?.id ?? `q:${word}`;

  // ── 2. Parse, classify, and deduplicate ───────────────────────────────
  //
  // Strategy:
  //   1. Parse all ml= results, noting which have the "syn" tag
  //   2. Find the score threshold: 75% of the highest syn-tagged word's score
  //   3. ml= words with "syn" tag → "synonym"
  //   4. ml= words WITHOUT "syn" tag but same POS as a syn-tagged word
  //      AND score >= threshold → "synonym" (promotes "bewilderment" etc.)
  //   5. Remaining ml= words → "related"
  //   6. rel_ant= words → "antonym"
  //
  //   Sort by Datamuse score (relevance), with frequency as tiebreaker.

  const mlParsed: ParsedWord[] = [];
  const seen = new Set<string>();
  seen.add(word);

  for (const item of mlRaw) {
    const w = item.word.toLowerCase().trim();
    if (seen.has(w) || w.length > 30) continue;
    seen.add(w);
    mlParsed.push(parseDatamuseWord(item));
  }

  // Score threshold: 75% of the highest syn-tagged word's score.
  // For "confusion" this separates the 30M band (bewilderment, chaos)
  // from the 29M band (doubt, error, noise).
  const synPosSet = new Set<string>();
  let maxSynScore = 0;
  for (const p of mlParsed) {
    if (p.isSyn) {
      if (p.pos !== "other") synPosSet.add(p.pos);
      if (p.score > maxSynScore) maxSynScore = p.score;
    }
  }
  const scoreThreshold = maxSynScore * 0.75;

  // Classify ml= words
  const classified: ClassifiedWord[] = mlParsed.map((p) => {
    let relation: "synonym" | "related";
    if (p.isSyn) {
      relation = "synonym";
    } else if (
      p.pos !== "other" &&
      synPosSet.has(p.pos) &&
      p.score >= scoreThreshold
    ) {
      relation = "synonym";
    } else {
      relation = "related";
    }
    return { ...p, relation };
  });

  // Parse rel_ant= results → antonym
  for (const item of antRaw) {
    const w = item.word.toLowerCase().trim();
    if (seen.has(w) || w.length > 30) continue;
    seen.add(w);

    const p = parseDatamuseWord(item);
    classified.push({ ...p, relation: "antonym" });
  }

  // ── 3. Batch lookup in DB for metadata (definitions, levels) ──────────

  const allLabels = classified.map((w) => w.word.toLowerCase());
  const dbMetaMap = new Map<string, any>();

  if (allLabels.length) {
    const lookupRes = await db.execute(sql`
      SELECT id, word, pos, level, definition
      FROM vocab
      WHERE word = ANY(${sql.raw(pgArrayLiteral(allLabels))})
      LIMIT 300;
    `);
    for (const r of lookupRes as any[]) {
      dbMetaMap.set(r.word.toLowerCase(), r);
    }
  }

  // ── 4. Build graph ────────────────────────────────────────────────────

  const nodes: any[] = [];
  const edges: any[] = [];
  const nodeIds = new Set<string>();

  function addNode(node: any) {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  }

  // Center node
  addNode({
    id: centerId,
    label: word,
    kind: "center",
    pos: bestCenter?.pos ?? null,
    level: bestCenter?.level ?? null,
    definition: bestCenter?.definition ?? null,
  });

  // ── 4a. Group by POS ─────────────────────────────────────────────────

  const byPos = new Map<string, ClassifiedWord[]>();
  for (const cw of classified) {
    if (!byPos.has(cw.pos)) byPos.set(cw.pos, []);
    byPos.get(cw.pos)!.push(cw);
  }

  // Sort POS groups: prefer those with synonyms, then by total count
  const posSorted = [...byPos.entries()].sort((a, b) => {
    const aSyn = a[1].filter((w) => w.relation === "synonym").length;
    const bSyn = b[1].filter((w) => w.relation === "synonym").length;
    if (aSyn !== bSyn) return bSyn - aSyn;
    return b[1].length - a[1].length;
  });

  // ── 4b. For each POS: add synonym / antonym / related nodes ──────────

  for (const [pos, words] of posSorted) {
    const posId = `pos:${pos}`;

    addNode({
      id: posId,
      label: pos,
      kind: "pos-group",
      pos,
      level: null,
      definition: null,
    });

    edges.push({
      source: centerId,
      target: posId,
      weight: 1,
      edgeKind: "has-pos",
    });

    // Sort by a blend of Datamuse relevance + word frequency.
    // Datamuse scores are often very close, so frequency acts as
    // a practical tiebreaker that surfaces common words (quick, rapid)
    // above obscure ones (alacritous, profligate).
    const byBlended = (a: ClassifiedWord, b: ClassifiedWord) => {
      const aRank = a.score + Math.sqrt(a.freq + 1) * 500_000;
      const bRank = b.score + Math.sqrt(b.freq + 1) * 500_000;
      return bRank - aRank;
    };

    const syns = words
      .filter((w) => w.relation === "synonym")
      .sort(byBlended)
      .slice(0, MAX_SYN_PER_POS);

    const ants = words
      .filter((w) => w.relation === "antonym")
      .sort(byBlended)
      .slice(0, MAX_ANT_PER_POS);

    const rels = words
      .filter((w) => w.relation === "related")
      .sort(byBlended)
      .slice(0, MAX_REL_PER_POS);

    // Max score for weight normalization
    const allScores = [...syns, ...ants, ...rels].map((w) => w.score);
    const maxScore = Math.max(...allScores, 1);

    function addWordNode(
      cw: ClassifiedWord,
      kind: string,
      edgeKind: string
    ) {
      const dbRow = dbMetaMap.get(cw.word.toLowerCase());
      const nodeId = dbRow?.id ?? `${kind}:${cw.word.toLowerCase()}`;

      addNode({
        id: nodeId,
        label: cw.word,
        kind,
        pos: cw.pos,
        level: dbRow?.level ?? null,
        definition: dbRow?.definition ?? null,
        score: cw.score,
      });

      edges.push({
        source: posId,
        target: nodeId,
        weight: cw.score / maxScore,
        edgeKind,
      });
    }

    for (const s of syns) addWordNode(s, "synonym", "synonym");
    for (const a of ants) addWordNode(a, "antonym", "antonym");
    for (const r of rels) addWordNode(r, "related", "semantic");
  }

  // ── 5. Synonym chains — top synonyms' own synonyms (1 level deep) ────

  // Pick top 2 synonyms for chaining (one level deep)
  const topSyns = classified
    .filter((w) => w.relation === "synonym")
    .sort((a, b) => {
      const aR = a.score + Math.sqrt(a.freq + 1) * 500_000;
      const bR = b.score + Math.sqrt(b.freq + 1) * 500_000;
      return bR - aR;
    })
    .slice(0, 2);

  if (topSyns.length) {
    const chainResults = await Promise.all(
      topSyns.map((s) =>
        datamuse(
          `ml=${encodeURIComponent(s.word)}&max=6`
        ).then((res) => ({ parent: s, results: res }))
      )
    );

    // Collect new words for DB batch lookup
    const chainLabels = new Set<string>();
    for (const { results } of chainResults) {
      for (const r of results) {
        const w = r.word.toLowerCase();
        if (!seen.has(w)) chainLabels.add(w);
      }
    }

    const chainDbMap = new Map<string, any>();
    if (chainLabels.size) {
      const chainLookup = await db.execute(sql`
        SELECT id, word, pos, level, definition
        FROM vocab
        WHERE word = ANY(${sql.raw(pgArrayLiteral([...chainLabels]))})
        LIMIT 100;
      `);
      for (const r of chainLookup as any[]) {
        chainDbMap.set(r.word.toLowerCase(), r);
      }
    }

    for (const { parent, results } of chainResults) {
      const parentNode = nodes.find(
        (n: any) =>
          n.label?.toLowerCase() === parent.word.toLowerCase()
      );
      if (!parentNode) continue;

      // Parse and sort by blended score, take top 2
      const parsed = results
        .map(parseDatamuseWord)
        .filter((p) => !seen.has(p.word.toLowerCase()) && p.isSyn)
        .sort((a, b) => {
          const aR = a.score + Math.sqrt(a.freq + 1) * 500_000;
          const bR = b.score + Math.sqrt(b.freq + 1) * 500_000;
          return bR - aR;
        })
        .slice(0, 2);

      for (const p of parsed) {
        const w = p.word.toLowerCase();
        seen.add(w);

        const dbRow = chainDbMap.get(w);
        const chainId = dbRow?.id ?? `syn2:${w}`;

        addNode({
          id: chainId,
          label: p.word,
          kind: "synonym",
          pos: p.pos,
          level: dbRow?.level ?? null,
          definition: dbRow?.definition ?? null,
          score: p.score,
        });

        edges.push({
          source: parentNode.id,
          target: chainId,
          weight: 0.7,
          edgeKind: "synonym-chain",
        });
      }
    }
  }

  // ── 6. Cross-edges between top synonyms (same POS) ───────────────────

  const synsByPos = new Map<string, any[]>();
  for (const n of nodes) {
    if (n.kind !== "synonym") continue;
    const p = n.pos ?? "other";
    if (!synsByPos.has(p)) synsByPos.set(p, []);
    synsByPos.get(p)!.push(n);
  }

  for (const [_pos, synGroup] of synsByPos) {
    if (synGroup.length < 2) continue;
    const top = synGroup.slice(0, 4);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const alreadyEdged = edges.some(
          (e: any) =>
            (e.source === top[i].id && e.target === top[j].id) ||
            (e.source === top[j].id && e.target === top[i].id)
        );
        if (!alreadyEdged) {
          edges.push({
            source: top[i].id,
            target: top[j].id,
            weight: 0.3,
            edgeKind: "shared-synonym",
          });
        }
      }
    }
  }

  // ── 7. Return ─────────────────────────────────────────────────────────

  return c.json({
    ok: true,
    center: { id: centerId, word },
    nodes,
    edges,
  });
});

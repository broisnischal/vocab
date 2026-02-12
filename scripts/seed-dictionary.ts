/**
 * Bulk dictionary seeder — downloads a complete Webster's dictionary JSON
 * (86K words) in a single HTTP request, then inserts directly into Postgres.
 *
 * NO per-word API calls. NO rate limiting. Runs in ~30-60 seconds for 10K+ words.
 *
 * Usage:  bun run scripts/seed-dictionary.ts
 *
 * Re-run safe: skips words already in the DB.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

// ── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200;
const DIM = 384;
const MAX_WORDS = 10_000; // how many words to insert (from frequency-sorted list)

// ── DB connection ────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

const client = postgres(DATABASE_URL, { max: 5, idle_timeout: 30 });
const db = drizzle(client);

// ── Embedding (same as src/embedding.ts) ─────────────────────────────────────

function embedText(text: string): number[] {
  const v = new Array(DIM).fill(0);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
    const idx = Math.abs(h) % DIM;
    v[idx] += 1;
  }
  const norm = Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0)) || 1;
  return v.map((x: number) => x / norm);
}

function vectorToSql(vec: number[]) {
  return `[${vec.join(",")}]`;
}

// ── POS heuristic from definition text ───────────────────────────────────────

function guessPOS(definition: string): string | null {
  const d = definition.trim().toLowerCase();
  // Verb patterns
  if (/^to\s/.test(d)) return "verb";
  if (/^(the act of|the process of)/.test(d)) return "noun";
  // Adjective patterns
  if (/^(of or|of,? relating|pertaining|resembling|having the quality|characterized by)/.test(d))
    return "adjective";
  if (/^(in a |in an )/.test(d)) return "adverb";
  // Noun patterns — articles or possessive at start
  if (/^(a |an |the |one who|one that|any )/.test(d)) return "noun";
  // Fallback: if definition starts with a capital and has ";" it's likely a noun
  if (/^[A-Z]/.test(definition.trim()) && /;/.test(definition)) return "noun";
  return null;
}

// ── CEFR level heuristic ─────────────────────────────────────────────────────

function guessLevel(rank: number): string {
  if (rank < 500) return "A1";
  if (rank < 1500) return "A2";
  if (rank < 3000) return "B1";
  if (rank < 5500) return "B2";
  if (rank < 8000) return "C1";
  return "C2";
}

// ── SQL helper ───────────────────────────────────────────────────────────────

function escSql(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

// ── Download dictionary ──────────────────────────────────────────────────────

interface DictData {
  [word: string]: string; // word -> definition
}

async function downloadDictionary(): Promise<DictData> {
  const url =
    "https://raw.githubusercontent.com/adambom/dictionary/master/dictionary.json";
  console.log("  Downloading Webster's dictionary (86K words)...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download dictionary: ${res.status}`);
  const data = (await res.json()) as DictData;
  console.log(`  Downloaded: ${Object.keys(data).length} entries`);
  return data;
}

// ── Download common word frequency list (for ranking) ────────────────────────

async function getFrequencyList(): Promise<string[]> {
  const url =
    "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt";
  console.log("  Downloading frequency list...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download word list: ${res.status}`);
  const text = await res.text();
  return text
    .split("\n")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2 && /^[a-z]+$/.test(w));
}

// ── Get Datamuse synonyms in bulk (no rate limit) ────────────────────────────

const SYNONYM_CONCURRENCY = 20;

async function fetchSynonyms(word: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=8`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { word: string }[];
    return data.map((d) => d.word);
  } catch {
    return [];
  }
}

async function batchFetchSynonyms(
  words: string[],
  onProgress: (done: number) => void
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= words.length) break;
      const word = words[i];
      const syns = await fetchSynonyms(word);
      if (syns.length) result.set(word, syns);
      if ((i + 1) % 200 === 0) onProgress(i + 1);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < SYNONYM_CONCURRENCY; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  onProgress(words.length);
  return result;
}

// ── Get existing words from DB ───────────────────────────────────────────────

async function getExistingWords(): Promise<Set<string>> {
  const rows = await db.execute(sql`SELECT word FROM vocab`);
  return new Set((rows as any[]).map((r) => r.word.toLowerCase()));
}

// ── Batch insert ─────────────────────────────────────────────────────────────

interface VocabRow {
  word: string;
  pos: string | null;
  level: string;
  definition: string;
  examples: string[];
  synonyms: string[];
  embeddingSql: string;
}

async function insertBatch(rows: VocabRow[]) {
  if (!rows.length) return;

  const valuesClauses = rows.map((r) => {
    const w = `'${escSql(r.word)}'`;
    const p = r.pos ? `'${escSql(r.pos)}'` : "NULL";
    const l = `'${r.level}'`;
    const d = `'${escSql(r.definition)}'`;
    const ex = `'${escSql(JSON.stringify(r.examples))}'::jsonb`;
    const sy = `'${escSql(JSON.stringify(r.synonyms))}'::jsonb`;
    const em = `'${r.embeddingSql}'::vector`;
    return `(${w}, ${p}, ${l}, ${d}, ${ex}, ${sy}, ${em})`;
  });

  const query = `
    INSERT INTO vocab (word, pos, level, definition, examples, synonyms, embedding)
    VALUES ${valuesClauses.join(",\n")}
    ON CONFLICT DO NOTHING;
  `;

  await db.execute(sql.raw(query));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n  ====== Dictionary Bulk Seeder ======\n");

  // 1. Download dictionary + frequency list in parallel
  const [dictionary, freqList] = await Promise.all([
    downloadDictionary(),
    getFrequencyList(),
  ]);

  // 2. Check existing words in DB
  console.log("  Checking existing words in DB...");
  const existing = await getExistingWords();
  console.log(`  Already in DB: ${existing.size} words`);

  // 3. Build word list: prioritize frequency-ranked words that exist in dictionary
  const dictLower = new Map<string, string>();
  for (const [word, def] of Object.entries(dictionary)) {
    dictLower.set(word.toLowerCase(), def);
  }

  // Start with frequency-ranked words (most common first)
  const orderedWords: { word: string; def: string; rank: number }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < freqList.length && orderedWords.length < MAX_WORDS; i++) {
    const w = freqList[i];
    if (existing.has(w) || seen.has(w)) continue;
    const def = dictLower.get(w);
    if (!def) continue;
    orderedWords.push({ word: w, def, rank: i });
    seen.add(w);
  }

  // If we still have room, add more from the dictionary itself
  if (orderedWords.length < MAX_WORDS) {
    const dictWords = [...dictLower.keys()]
      .filter((w) => !existing.has(w) && !seen.has(w))
      .filter((w) => w.length >= 3 && w.length <= 20 && /^[a-z]+$/.test(w));

    // Shuffle deterministically to get variety
    dictWords.sort((a, b) => a.localeCompare(b));

    for (const w of dictWords) {
      if (orderedWords.length >= MAX_WORDS) break;
      orderedWords.push({
        word: w,
        def: dictLower.get(w)!,
        rank: 10_000 + orderedWords.length, // high rank = advanced level
      });
      seen.add(w);
    }
  }

  console.log(`  New words to insert: ${orderedWords.length}\n`);

  if (!orderedWords.length) {
    console.log("  Nothing to do.\n");
    await client.end();
    return;
  }

  // 4. Fetch synonyms from Datamuse (no rate limit, very fast)
  console.log("  Fetching synonyms from Datamuse API (no rate limit)...");
  const wordList = orderedWords.map((w) => w.word);
  const synonymsMap = await batchFetchSynonyms(wordList, (done) => {
    console.log(`    synonyms progress: ${done}/${wordList.length}`);
  });
  console.log(`  Got synonyms for ${synonymsMap.size} words\n`);

  // 5. Prepare rows
  const rows: VocabRow[] = [];
  for (const { word, def, rank } of orderedWords) {
    // Clean definition — take first sentence or first 300 chars
    let cleanDef = def.replace(/\n/g, " ").trim();
    if (cleanDef.length > 300) {
      const dotPos = cleanDef.indexOf(".", 40);
      if (dotPos > 0 && dotPos < 300) {
        cleanDef = cleanDef.substring(0, dotPos + 1);
      } else {
        cleanDef = cleanDef.substring(0, 300) + "...";
      }
    }

    const pos = guessPOS(cleanDef);
    const synonyms = synonymsMap.get(word) ?? [];

    // Build embedding blob
    const blob = [
      `word: ${word}`,
      pos ? `pos: ${pos}` : "",
      `definition: ${cleanDef}`,
      synonyms.length ? `synonyms: ${synonyms.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    rows.push({
      word,
      pos,
      level: guessLevel(rank),
      definition: cleanDef,
      examples: [], // Webster's doesn't have examples, but that's fine
      synonyms,
      embeddingSql: vectorToSql(embedText(blob)),
    });
  }

  // 6. Insert in batches
  console.log(`  Inserting ${rows.length} words into Postgres...`);
  const startTime = Date.now();
  let inserted = 0;
  let batchErrors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      await insertBatch(batch);
      inserted += batch.length;
    } catch (err: any) {
      // Fallback: one-by-one
      for (const row of batch) {
        try {
          await insertBatch([row]);
          inserted++;
        } catch {
          batchErrors++;
        }
      }
    }

    if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= rows.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `    [${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}] inserted: ${inserted} | errors: ${batchErrors} | ${elapsed}s`
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ── Results ──`);
  console.log(`  Inserted:    ${inserted}`);
  console.log(`  Errors:      ${batchErrors}`);
  console.log(`  Time:        ${elapsed}s`);
  console.log(`  Total in DB: ${existing.size + inserted}\n`);

  await client.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  client.end();
  process.exit(1);
});

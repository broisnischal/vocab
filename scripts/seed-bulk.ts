/**
 * Bulk seed script — downloads a frequency-based English word list,
 * enriches each word via the Free Dictionary API, and inserts directly
 * into Postgres with vector embeddings.
 *
 * Usage:  bun run scripts/seed-bulk.ts
 *
 * Re-run safe: skips words already in the DB.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/vocab.schema";

// ── Config ───────────────────────────────────────────────────────────────────

const CONCURRENCY = 12;
const BATCH_SIZE = 50;
const DIM = 384;
const MAX_WORDS = 5000; // how many words to process from the frequency list

// ── DB connection ────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

const client = postgres(DATABASE_URL, { max: 3, idle_timeout: 30 });
const db = drizzle(client, { schema });

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

// ── CEFR level by frequency rank ─────────────────────────────────────────────

function guessLevel(rank: number): string {
  if (rank < 500) return "A1";
  if (rank < 1200) return "A2";
  if (rank < 2500) return "B1";
  if (rank < 4000) return "B2";
  if (rank < 5500) return "C1";
  return "C2";
}

// ── Free Dictionary API with retry ───────────────────────────────────────────

interface DictMeaning {
  partOfSpeech: string;
  definitions: {
    definition: string;
    example?: string;
    synonyms?: string[];
    antonyms?: string[];
  }[];
  synonyms?: string[];
  antonyms?: string[];
}

interface DictEntry {
  word: string;
  meanings: DictMeaning[];
}

async function fetchWord(word: string, retries = 2): Promise<DictEntry | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );
      if (res.status === 404) return null; // word genuinely not found
      if (res.status === 429) {
        // Rate limited — back off
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        if (attempt < retries) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        return null;
      }
      const data = (await res.json()) as DictEntry[];
      return data[0] ?? null;
    } catch {
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Word list ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "his", "how", "its", "may",
  "now", "old", "see", "way", "who", "did", "get", "him", "let",
  "say", "she", "too", "use", "www", "com", "org", "net", "edu", "gov",
  "htm", "html", "http", "https", "php", "asp", "pdf", "jpg", "gif",
  "png", "xml", "rss", "css", "that", "this", "with", "from", "your",
  "they", "been", "have", "will", "each", "make", "like", "just", "over",
  "such", "than", "them", "very", "when", "what", "some", "into", "most",
  "also", "then", "these", "about", "other", "which", "their", "there",
  "would", "could", "should", "where", "being", "here", "were",
  "does", "done", "else", "more", "much", "only", "same", "still",
  "well", "those", "while", "after", "before", "because", "between",
  "under", "until", "upon", "every", "both", "many", "shall",
]);

async function getWordList(): Promise<string[]> {
  const url =
    "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt";

  console.log("  Downloading word list...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download word list: ${res.status}`);
  const text = await res.text();

  return text
    .split("\n")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && w.length <= 25)
    .filter((w) => /^[a-z]+$/.test(w))
    .filter((w) => !STOP_WORDS.has(w))
    .slice(0, MAX_WORDS);
}

// ── Process entry → row ──────────────────────────────────────────────────────

interface VocabRow {
  word: string;
  pos: string | null;
  level: string;
  definition: string | null;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  embeddingSql: string;
}

function processEntry(entry: DictEntry, rank: number): VocabRow | null {
  if (!entry.meanings?.length) return null;

  const meaning = entry.meanings[0];
  const definition = meaning.definitions[0]?.definition ?? null;
  if (!definition) return null;

  const allSynonyms = new Set<string>();
  const allAntonyms = new Set<string>();
  for (const m of entry.meanings) {
    if (m.synonyms) m.synonyms.forEach((s) => allSynonyms.add(s));
    if (m.antonyms) m.antonyms.forEach((a) => allAntonyms.add(a));
    for (const d of m.definitions) {
      if (d.synonyms) d.synonyms.forEach((s) => allSynonyms.add(s));
      if (d.antonyms) d.antonyms.forEach((a) => allAntonyms.add(a));
    }
  }

  const examples: string[] = [];
  for (const m of entry.meanings) {
    for (const d of m.definitions) {
      if (d.example && examples.length < 3) examples.push(d.example);
    }
  }

  const word = entry.word.toLowerCase().trim();
  const blob = [
    `word: ${word}`,
    meaning.partOfSpeech ? `pos: ${meaning.partOfSpeech}` : "",
    definition ? `definition: ${definition}` : "",
    examples.length ? `examples: ${examples.join(" | ")}` : "",
    allSynonyms.size ? `synonyms: ${[...allSynonyms].join(", ")}` : "",
    allAntonyms.size ? `antonyms: ${[...allAntonyms].join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    word,
    pos: meaning.partOfSpeech || null,
    level: guessLevel(rank),
    definition,
    examples,
    synonyms: [...allSynonyms].slice(0, 10),
    antonyms: [...allAntonyms].slice(0, 10),
    embeddingSql: vectorToSql(embedText(blob)),
  };
}

// ── Batch insert ─────────────────────────────────────────────────────────────

function escSql(s: string): string {
  return s.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

async function insertBatch(rows: VocabRow[]) {
  if (!rows.length) return;

  const valuesClauses = rows.map((r) => {
    const w = `'${escSql(r.word)}'`;
    const p = r.pos ? `'${escSql(r.pos)}'` : "NULL";
    const l = `'${r.level}'`;
    const d = r.definition ? `'${escSql(r.definition)}'` : "NULL";
    const ex = `'${escSql(JSON.stringify(r.examples))}'::jsonb`;
    const sy = `'${escSql(JSON.stringify(r.synonyms))}'::jsonb`;
    const an = `'${escSql(JSON.stringify(r.antonyms))}'::jsonb`;
    const em = `'${r.embeddingSql}'::vector`;
    return `(${w}, ${p}, ${l}, ${d}, ${ex}, ${sy}, ${an}, ${em})`;
  });

  const query = `
    INSERT INTO vocab (word, pos, level, definition, examples, synonyms, antonyms, embedding)
    VALUES ${valuesClauses.join(",\n")}
    ON CONFLICT DO NOTHING;
  `;

  await db.execute(sql.raw(query));
}

// ── Get existing words ───────────────────────────────────────────────────────

async function getExistingWords(): Promise<Set<string>> {
  const rows = await db.execute(sql`SELECT word FROM vocab`);
  return new Set((rows as any[]).map((r) => r.word.toLowerCase()));
}

// ── Main processing with queue ───────────────────────────────────────────────

async function main() {
  console.log("\n  === Bulk Vocabulary Seeder ===\n");

  const allWords = await getWordList();
  console.log(`  Word list: ${allWords.length} words`);

  console.log("  Checking existing words in DB...");
  const existing = await getExistingWords();
  console.log(`  Already in DB: ${existing.size} words`);

  // Filter out words already in DB, keep track of original rank
  const wordsWithRank: { word: string; rank: number }[] = [];
  allWords.forEach((w, i) => {
    if (!existing.has(w)) wordsWithRank.push({ word: w, rank: i });
  });

  console.log(`  New words to fetch: ${wordsWithRank.length}\n`);

  if (!wordsWithRank.length) {
    console.log("  Nothing to do.\n");
    await client.end();
    return;
  }

  let added = 0;
  let failed = 0;
  let notFound = 0;
  let queueIdx = 0;
  const total = wordsWithRank.length;
  const pending: VocabRow[] = [];
  const startTime = Date.now();

  async function flushBatch() {
    if (!pending.length) return;
    const batch = pending.splice(0, BATCH_SIZE);
    try {
      await insertBatch(batch);
      added += batch.length;
    } catch (err: any) {
      // Fallback: insert one by one
      for (const row of batch) {
        try {
          await insertBatch([row]);
          added++;
        } catch {
          failed++;
        }
      }
    }
  }

  // Queue-based worker: each worker grabs next item from shared index
  async function worker() {
    while (true) {
      const idx = queueIdx++;
      if (idx >= wordsWithRank.length) break;

      const { word, rank } = wordsWithRank[idx];

      const entry = await fetchWord(word);

      if (!entry) {
        notFound++;
      } else {
        const row = processEntry(entry, rank);
        if (row) {
          pending.push(row);
          if (pending.length >= BATCH_SIZE) {
            await flushBatch();
          }
        } else {
          failed++;
        }
      }

      const processed = idx + 1;
      if (processed % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
        console.log(
          `  [${processed}/${total}] added: ${added} | pending: ${pending.length} | not-found: ${notFound} | failed: ${failed} | ${rate} w/s | ${elapsed}s`
        );
      }
    }
  }

  // Launch workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  // Flush remaining
  await flushBatch();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ── Results ──`);
  console.log(`  Added:     ${added}`);
  console.log(`  Not found: ${notFound} (not in Free Dictionary API)`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Time:      ${elapsed}s`);
  console.log(`  Total in DB now: ${existing.size + added}\n`);

  await client.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  client.end();
  process.exit(1);
});

/**
 * Seed script — fetches real word data from the Free Dictionary API
 * and posts it to the local vocab server.
 *
 * Usage:  bun run scripts/seed-vocab.ts
 *
 * API docs: https://dictionaryapi.dev/
 */

const SERVER = process.env.SERVER_URL ?? "http://localhost:5173";

// ── Word list to seed ────────────────────────────────────────────────────────
// Add/remove words here as you like

const words = [
  // B1–B2
  "abundant", "cautious", "elaborate", "genuine", "humble",
  "innovative", "mundane", "notorious", "obscure", "peculiar",
  "reluctant", "spontaneous", "trivial", "versatile", "vivid",
  // B2–C1
  "arduous", "benign", "clandestine", "debacle", "enigma",
  "frugal", "gregarious", "lucid", "melancholy", "nonchalant",
  "ominous", "pensive", "quintessential", "resilience", "sanguine",
  // C1–C2
  "acumen", "brevity", "cogent", "deft", "effervescent",
  "fastidious", "gratuitous", "hubris", "idyllic", "juxtapose",
  "kinetic", "labyrinth", "magnanimous", "nebulous", "ostentatious",
  "pernicious", "quixotic", "recalcitrant", "sagacious", "taciturn",
  "ubiquity", "voracious", "whimsical", "zealous", "aplomb",
  // More good words
  "audacious", "capricious", "dilapidated", "euphoria", "formidable",
  "galvanize", "hapless", "impeccable", "jovial", "keen",
  "lament", "meander", "nuance", "opulent", "placid",
  "querulous", "rampant", "serene", "turbulent", "unwavering",
];

// ── CEFR level heuristic (by word frequency / difficulty) ────────────────────

function guessLevel(word: string, meanings: any[]): string {
  const simple = [
    "keen", "vivid", "humble", "serene", "placid", "jovial",
    "mundane", "genuine", "cautious",
  ];
  const b2 = [
    "abundant", "elaborate", "innovative", "notorious", "obscure",
    "peculiar", "reluctant", "spontaneous", "trivial", "versatile",
    "resilience", "turbulent", "formidable", "rampant", "unwavering",
    "lament", "nuance", "opulent", "audacious",
  ];
  const c1 = [
    "arduous", "benign", "clandestine", "debacle", "enigma",
    "frugal", "gregarious", "lucid", "melancholy", "nonchalant",
    "ominous", "pensive", "quintessential", "sanguine", "acumen",
    "brevity", "cogent", "deft", "effervescent", "fastidious",
    "gratuitous", "hubris", "idyllic", "juxtapose", "kinetic",
    "labyrinth", "magnanimous", "aplomb", "impeccable", "galvanize",
    "capricious", "euphoria", "meander", "hapless",
  ];
  const c2 = [
    "nebulous", "ostentatious", "pernicious", "quixotic",
    "recalcitrant", "sagacious", "taciturn", "ubiquity",
    "voracious", "whimsical", "zealous", "dilapidated",
    "querulous", "placid",
  ];

  const w = word.toLowerCase();
  if (simple.includes(w)) return "B1";
  if (b2.includes(w)) return "B2";
  if (c1.includes(w)) return "C1";
  if (c2.includes(w)) return "C2";
  return "B2"; // default
}

// ── Fetch from Free Dictionary API ───────────────────────────────────────────

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

async function fetchWord(word: string): Promise<DictEntry | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as DictEntry[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

// ── Post to local server ─────────────────────────────────────────────────────

async function postVocab(body: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SERVER}/api/vocab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n  Seeding vocab → ${SERVER}/api/vocab`);
  console.log(`  Words to process: ${words.length}\n`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const word of words) {
    // Small delay to be polite to the free API
    await new Promise((r) => setTimeout(r, 300));

    const entry = await fetchWord(word);

    if (!entry || !entry.meanings?.length) {
      console.log(`  ✗ ${word} — not found in dictionary`);
      failed++;
      continue;
    }

    // Pick the first meaning
    const meaning = entry.meanings[0];
    const allSynonyms = new Set<string>();
    const allAntonyms = new Set<string>();

    // Gather synonyms and antonyms from all meanings
    for (const m of entry.meanings) {
      if (m.synonyms) m.synonyms.forEach((s) => allSynonyms.add(s));
      if (m.antonyms) m.antonyms.forEach((a) => allAntonyms.add(a));
      for (const d of m.definitions) {
        if (d.synonyms) d.synonyms.forEach((s) => allSynonyms.add(s));
        if (d.antonyms) d.antonyms.forEach((a) => allAntonyms.add(a));
      }
    }

    // Gather examples
    const examples: string[] = [];
    for (const m of entry.meanings) {
      for (const d of m.definitions) {
        if (d.example && examples.length < 3) {
          examples.push(d.example);
        }
      }
    }

    // Best definition
    const definition = meaning.definitions[0]?.definition ?? "";

    const payload = {
      word: entry.word.toLowerCase().trim(),
      pos: meaning.partOfSpeech || undefined,
      level: guessLevel(word, entry.meanings),
      definition,
      examples: examples.length ? examples : undefined,
      synonyms: allSynonyms.size
        ? [...allSynonyms].slice(0, 8)
        : undefined,
      antonyms: allAntonyms.size
        ? [...allAntonyms].slice(0, 8)
        : undefined,
    };

    const result = await postVocab(payload);

    if (result.ok) {
      const synStr = payload.synonyms?.length
        ? ` [${payload.synonyms.slice(0, 3).join(", ")}...]`
        : "";
      console.log(
        `  ✓ ${payload.word} (${payload.pos ?? "?"}, ${payload.level})${synStr}`
      );
      added++;
    } else {
      console.log(`  ✗ ${word} — ${result.error ?? "failed to post"}`);
      failed++;
    }
  }

  console.log(
    `\n  Done! Added: ${added}, Skipped: ${skipped}, Failed: ${failed}\n`
  );
}

main();

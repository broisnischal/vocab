const DIM = Number(process.env.EMBEDDING_DIM ?? 384);

// Simple deterministic hash -> vector (placeholder).
// Replace this later with real embeddings (OpenAI / local model).
export function embedText(text: string): number[] {
  const v = new Array(DIM).fill(0);
  let h = 2166136261; // FNV-ish
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
    const idx = Math.abs(h) % DIM;
    v[idx] += 1;
  }
  // normalize
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function vectorToSql(vec: number[]) {
  // pgvector accepts: '[1,2,3]' format
  return `[${vec.join(",")}]`;
}

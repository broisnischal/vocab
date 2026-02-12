import { up } from "up-fetch";

export const upfetch = up(fetch, () => ({
  baseUrl: "",
}));

// ── Vocab API ────────────────────────────────────────────────────────────────

export interface VocabInput {
  word: string;
  pos?: string;
  level?: string;
  definition?: string;
  examples?: string[];
  synonyms?: string[];
}

export interface VocabRow {
  id: string;
  word: string;
  pos: string | null;
  level: string | null;
  definition: string | null;
  examples: string[];
  synonyms: string[];
  createdAt: string;
}

export async function addVocab(input: VocabInput) {
  return upfetch("/api/vocab", {
    method: "POST",
    body: input,
  }) as Promise<{ ok: true; vocab: VocabRow }>;
}

export async function getVocab(id: string) {
  return upfetch(`/api/vocab/${id}`) as Promise<{ ok: true; vocab: VocabRow }>;
}

// ── Search API ───────────────────────────────────────────────────────────────

export interface SearchParams {
  query: string;
  topK?: number;
  level?: string;
}

export interface SearchResult extends VocabRow {
  distance: number;
}

export async function searchVocab(params: SearchParams) {
  return upfetch("/api/search", {
    method: "POST",
    body: {
      query: params.query,
      topK: params.topK ?? 10,
      level: params.level,
    },
  }) as Promise<{ ok: true; results: SearchResult[] }>;
}

// ── Graph API ────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  kind: "center" | "related" | "synonym";
  level: string | null;
  score?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: "related" | "synonym";
}

export async function fetchGraph(word: string) {
  return upfetch(`/api/graph?word=${encodeURIComponent(word)}`) as Promise<{
    ok: true;
    center: { id: string; word: string };
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>;
}

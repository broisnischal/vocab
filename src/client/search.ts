import { searchVocab, type SearchResult } from "./api";

// ── DOM refs ─────────────────────────────────────────────────────────────────

const form = document.getElementById("search-form") as HTMLFormElement;
const queryInput = document.getElementById("s-query") as HTMLInputElement;
const levelSelect = document.getElementById("s-level") as HTMLSelectElement;
const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
const statusEl = document.getElementById("search-status") as HTMLDivElement;
const resultsEl = document.getElementById("search-results") as HTMLDivElement;

// ── Search handler ───────────────────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  searchBtn.textContent = "Searching...";
  statusEl.textContent = "";
  resultsEl.innerHTML = "";

  try {
    const res = await searchVocab({
      query,
      topK: 15,
      level: levelSelect.value || undefined,
    });

    const results = res.results as SearchResult[];

    if (!results.length) {
      statusEl.textContent = "No results found.";
      statusEl.className = "mt-4 text-sm text-gray-500";
      return;
    }

    statusEl.textContent = `Found ${results.length} result${results.length > 1 ? "s" : ""}`;
    statusEl.className = "mt-4 text-sm text-gray-400";
    renderResults(results);
  } catch (err: any) {
    statusEl.textContent = err.message ?? "Search failed";
    statusEl.className = "mt-4 text-sm text-red-500";
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = "Search";
  }
});

// ── Render results ───────────────────────────────────────────────────────────

function renderResults(results: SearchResult[]) {
  resultsEl.innerHTML = results
    .map((r, i) => {
      const similarity = r.distance != null ? (1 - Number(r.distance)).toFixed(3) : null;
      return `
        <div class="group rounded-xl border border-gray-100 bg-white p-5 transition hover:border-gray-200 hover:shadow-sm">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2.5">
                <span class="text-xs font-mono text-gray-300 tabular-nums w-5 text-right">${i + 1}</span>
                <span class="font-semibold text-gray-900 text-base">${esc(r.word)}</span>
                ${r.pos ? `<span class="text-xs text-gray-400 italic">${esc(r.pos)}</span>` : ""}
                ${r.level ? `<span class="inline-flex items-center rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">${esc(r.level)}</span>` : ""}
              </div>
              ${r.definition ? `<p class="text-sm text-gray-600 mt-1.5 ml-7">${esc(r.definition)}</p>` : ""}
              ${
                r.examples?.length
                  ? `<div class="ml-7 mt-2 space-y-1">${(r.examples as string[])
                      .slice(0, 2)
                      .map(
                        (ex) =>
                          `<p class="text-xs text-gray-400 italic before:content-['"'] after:content-['"']">${esc(ex)}</p>`
                      )
                      .join("")}</div>`
                  : ""
              }
              ${
                r.synonyms?.length
                  ? `<div class="flex gap-1.5 mt-2 ml-7 flex-wrap">${(r.synonyms as string[])
                      .map(
                        (s) =>
                          `<span class="rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-xs text-gray-500">${esc(s)}</span>`
                      )
                      .join("")}</div>`
                  : ""
              }
            </div>
            <div class="flex flex-col items-end gap-1.5 shrink-0">
              ${
                similarity
                  ? `<span class="text-xs font-mono text-gray-300" title="Cosine similarity">${similarity}</span>`
                  : ""
              }
              <a
                href="/graph?word=${encodeURIComponent(r.word)}"
                class="text-xs text-gray-400 hover:text-gray-900 transition underline decoration-dashed underline-offset-2 opacity-0 group-hover:opacity-100"
              >
                view graph
              </a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

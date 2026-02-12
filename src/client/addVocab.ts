import { addVocab, type VocabRow } from "./api";

// ── DOM refs ─────────────────────────────────────────────────────────────────

const form = document.getElementById("add-form") as HTMLFormElement;
const wordInput = document.getElementById("f-word") as HTMLInputElement;
const posSelect = document.getElementById("f-pos") as HTMLSelectElement;
const levelInput = document.getElementById("f-level") as HTMLInputElement;
const defInput = document.getElementById("f-definition") as HTMLTextAreaElement;
const examplesInput = document.getElementById("f-examples") as HTMLTextAreaElement;
const synonymsInput = document.getElementById("f-synonyms") as HTMLInputElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const statusEl = document.getElementById("form-status") as HTMLSpanElement;
const recentList = document.getElementById("recent-list") as HTMLDivElement;

// ── Level toggle buttons ─────────────────────────────────────────────────────

const levelBtns = document.querySelectorAll<HTMLButtonElement>(".level-btn");
let selectedLevel = "";

levelBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const lv = btn.dataset.level ?? "";
    if (selectedLevel === lv) {
      selectedLevel = "";
      btn.classList.remove("!border-gray-900", "!text-gray-900", "!bg-gray-50");
    } else {
      levelBtns.forEach((b) =>
        b.classList.remove("!border-gray-900", "!text-gray-900", "!bg-gray-50")
      );
      selectedLevel = lv;
      btn.classList.add("!border-gray-900", "!text-gray-900", "!bg-gray-50");
    }
    levelInput.value = selectedLevel;
  });
});

// ── Form submit ──────────────────────────────────────────────────────────────

const recentWords: VocabRow[] = [];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const word = wordInput.value.trim();
  if (!word) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Adding...";
  statusEl.textContent = "";
  statusEl.className = "text-sm";

  try {
    const examples = examplesInput.value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const synonyms = synonymsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await addVocab({
      word,
      pos: posSelect.value || undefined,
      level: selectedLevel || undefined,
      definition: defInput.value.trim() || undefined,
      examples: examples.length ? examples : undefined,
      synonyms: synonyms.length ? synonyms : undefined,
    });

    recentWords.unshift(res.vocab);
    renderRecent();

    // Reset form
    form.reset();
    selectedLevel = "";
    levelInput.value = "";
    levelBtns.forEach((b) =>
      b.classList.remove("!border-gray-900", "!text-gray-900", "!bg-gray-50")
    );

    statusEl.textContent = `Added "${res.vocab.word}"`;
    statusEl.className = "text-sm text-green-600";
  } catch (err: any) {
    statusEl.textContent = err.message ?? "Failed to add word";
    statusEl.className = "text-sm text-red-500";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Add Word";
  }
});

// ── Render recent additions ──────────────────────────────────────────────────

function renderRecent() {
  if (!recentWords.length) {
    recentList.innerHTML = "";
    return;
  }

  recentList.innerHTML = `
    <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recently Added</h3>
    ${recentWords
      .slice(0, 8)
      .map(
        (w) => `
      <div class="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-900">${esc(w.word)}</span>
            ${w.pos ? `<span class="text-xs text-gray-400 italic">${esc(w.pos)}</span>` : ""}
            ${w.level ? `<span class="inline-flex items-center rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">${esc(w.level)}</span>` : ""}
          </div>
          ${w.definition ? `<p class="text-sm text-gray-600 mt-1">${esc(w.definition)}</p>` : ""}
          ${
            w.synonyms?.length
              ? `<div class="flex gap-1.5 mt-2 flex-wrap">${w.synonyms
                  .map(
                    (s) =>
                      `<span class="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500">${esc(s)}</span>`
                  )
                  .join("")}</div>`
              : ""
          }
        </div>
        <a href="/graph?word=${encodeURIComponent(w.word)}" class="shrink-0 text-xs text-gray-400 hover:text-gray-900 transition underline decoration-dashed underline-offset-2">graph</a>
      </div>
    `
      )
      .join("")}
  `;
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

import Layout from "../components/layout";
import { Script } from "vite-ssr-components/hono";

export default function AddVocab() {
  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Add Vocabulary
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Add a new word with its definition, examples, and synonyms
          </p>
        </div>

        <form id="add-form" className="space-y-5">
          {/* Word + POS row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Word <span className="text-red-400">*</span>
              </label>
              <input
                id="f-word"
                type="text"
                required
                placeholder="e.g. ephemeral"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Part of Speech
              </label>
              <select
                id="f-pos"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              >
                <option value="">Select...</option>
                <option value="noun">Noun</option>
                <option value="verb">Verb</option>
                <option value="adjective">Adjective</option>
                <option value="adverb">Adverb</option>
                <option value="preposition">Preposition</option>
                <option value="conjunction">Conjunction</option>
                <option value="interjection">Interjection</option>
              </select>
            </div>
          </div>

          {/* Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Level
            </label>
            <div className="flex gap-2" id="f-level-group">
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((lv) => (
                <button
                  type="button"
                  data-level={lv}
                  className="level-btn rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-900"
                >
                  {lv}
                </button>
              ))}
            </div>
            <input type="hidden" id="f-level" />
          </div>

          {/* Definition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Definition
            </label>
            <textarea
              id="f-definition"
              rows={3}
              placeholder="The meaning of the word..."
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 resize-none"
            />
          </div>

          {/* Examples */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Examples
              <span className="text-gray-400 font-normal ml-1">(one per line)</span>
            </label>
            <textarea
              id="f-examples"
              rows={3}
              placeholder={"The ephemeral beauty of cherry blossoms.\nFame is often ephemeral."}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 resize-none"
            />
          </div>

          {/* Synonyms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Synonyms
              <span className="text-gray-400 font-normal ml-1">(comma-separated)</span>
            </label>
            <input
              id="f-synonyms"
              type="text"
              placeholder="fleeting, transient, brief"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              id="submit-btn"
              className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Word
            </button>
            <span id="form-status" className="text-sm" />
          </div>
        </form>

        {/* Recent additions */}
        <div id="recent-list" className="mt-10 space-y-3" />
      </div>
      <Script src="/src/client/addVocab.ts" type="module" />
    </Layout>
  );
}

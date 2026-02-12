import Layout from "../components/layout";
import { Script } from "vite-ssr-components/hono";

export default function SearchVocab() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Search Vocabulary
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Find words by semantic similarity using vector search
          </p>
        </div>

        {/* Search bar */}
        <form id="search-form" className="flex gap-3 items-end">
          <div className="flex-1">
            <input
              id="s-query"
              type="text"
              required
              placeholder="Search for a word or concept..."
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div className="w-24">
            <select
              id="s-level"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Level</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>
          </div>
          <button
            type="submit"
            id="search-btn"
            className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Search
          </button>
        </form>

        {/* Status */}
        <div id="search-status" className="mt-4 text-sm text-gray-500" />

        {/* Results */}
        <div id="search-results" className="mt-6 space-y-3" />
      </div>
      <Script src="/src/client/search.ts" type="module" />
    </Layout>
  );
}

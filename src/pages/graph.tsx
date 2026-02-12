import Layout from "../components/layout";
import { Script } from "vite-ssr-components/hono";

export default function GraphPage() {
  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-160px)]">
        {/* Header + search */}
        <div className="flex items-center justify-between mb-4 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Vocabulary Graph
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Explore word relationships through semantic similarity
            </p>
          </div>
          <form id="graph-form" className="flex gap-2 items-center shrink-0">
            <input
              id="g-word"
              type="text"
              required
              placeholder="Enter a word..."
              className="w-56 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            />
            <button
              type="submit"
              id="graph-btn"
              className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Explore
            </button>
          </form>
        </div>

        {/* Status — fixed height to prevent layout shift */}
        <div id="graph-status" className="text-sm text-gray-400 mb-3 h-5" />

        {/* Sigma container */}
        <div
          id="sigma-container"
          className="flex-1 w-full rounded-2xl border border-gray-200/80 bg-white overflow-hidden relative"
        >
          <div
            id="graph-placeholder"
            className="absolute inset-0 flex  items-center justify-center text-gray-300 text-sm"
          >
            Enter a word above to explore its connections
          </div>

          {/* Node info panel — absolute overlay, no layout shift */}
          <div
            id="node-info"
            className="hidden opacity-0 absolute bottom-4 left-4 z-20 max-w-sm rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg p-3 pointer-events-none transition-opacity duration-150"
          />
        </div>
      </div>
      <Script src="/src/client/vocabGraph.ts" type="module" />
    </Layout>
  );
}

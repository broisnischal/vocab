import Layout from "../components/layout"
import { Script } from "vite-ssr-components/hono"

export default function Index() {
    return (
        <Layout>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                        Vocabulary Graph
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Hover over nodes to explore connections
                    </p>
                </div>
            </div>
            <div
                id="sigma-container"
                className="w-full rounded-2xl border border-gray-200/80 bg-white overflow-hidden"
                style={{ height: "calc(100vh - 200px)" }}
            />
            <Script src="/src/client/graph.ts" type="module" />
        </Layout>
    )
}   
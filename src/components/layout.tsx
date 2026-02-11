import { ReactNode } from "react"

export default function Layout({ children }: { children: ReactNode }) {
    return <div className="flex flex-col min-h-screen p-20">{children}</div>
}                   
import { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Graph" },
  { href: "/add", label: "Add Word" },
  { href: "/search", label: "Search" },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50/30">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 flex items-center h-14 gap-8">
          <a
            href="/"
            className="text-sm font-bold text-gray-900 tracking-tight"
          >
            vocab
          </a>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <a
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:text-gray-900 hover:bg-gray-100"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}

"use client";
// Slim top bar, matching the Industrial site: wordmark + Home / Comps, with
// name/role/Sign out collapsed into a small user menu on the right.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function TopBar() {
  const pathname = usePathname();
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, []);
  if (pathname === "/login") return null;
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <header className="bg-navy text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-6">
        <Link href="/" className="font-display whitespace-nowrap leading-none">
          <span className="text-xl tracking-wide">Crow Holdings</span>
          <span className="text-xl tracking-wide text-white/60">: </span>
          <span className="text-xl tracking-wide text-[#C9B37E]">Credit Team</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm text-white/80">
          <Link className="px-2 py-1 rounded-sm hover:text-white hover:bg-white/10 font-semibold text-white" href="/">Home</Link>
          <Link className="px-2 py-1 rounded-sm hover:text-white hover:bg-white/10" href="/comps">Comps</Link>
        </nav>
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-xs text-white/80 border border-white/30 rounded-sm px-3 py-1.5 hover:bg-white/10 hover:text-white whitespace-nowrap"
          >
            {me ? me.name : "Account"} ▾
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white text-ink rounded-sm shadow-lg border border-slate-200 py-1 w-44">
                {me && (
                  <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-100">
                    {me.name} · {me.role === "ADMIN" ? "Admin" : "Analyst"}
                  </div>
                )}
                <button onClick={logout} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

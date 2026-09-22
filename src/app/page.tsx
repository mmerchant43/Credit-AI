import Link from "next/link";
import { prisma } from "@/lib/db";
import { ActiveDealAnalyses } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

// White line icons in the CrowConnect tile style — matching the Industrial site.
const Icons = {
  deal: (
    // Apartment block: the credit book leans multifamily
    <svg viewBox="0 0 48 48">
      <rect x="10" y="10" width="20" height="30" rx="0.5" strokeLinejoin="round" />
      <path d="M30 20h8v20h-8" strokeLinejoin="round" />
      <path d="M15 16h4M21 16h4M15 22h4M21 22h4M15 28h4M21 28h4M33 26h2M33 32h2" strokeLinecap="round" />
      <path d="M18 40v-6h4v6" strokeLinejoin="round" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" /><path d="M24 16v16M16 24h16" strokeLinecap="round" /></svg>
  ),
  search: (
    <svg viewBox="0 0 48 48"><circle cx="21" cy="21" r="12" /><path d="M30 30l10 10" strokeLinecap="round" /></svg>
  ),
};

export default async function Home() {
  const [total, marketCount, recent] = await Promise.all([
    prisma.creditComp.count({ where: { archived: false } }).catch(() => 0),
    prisma.creditComp.groupBy({ by: ["market"], where: { archived: false } }).then((g) => g.length).catch(() => 0),
    prisma.dealAnalysis.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: { subject: true },
    }).catch(() => []),
  ]);

  const toItem = (a: (typeof recent)[number]) => ({
    id: a.id,
    subjectName: a.subject.propertyName ?? a.subject.dealName ?? "Subject",
    location: [a.subject.city, a.subject.state].filter(Boolean).join(", "),
    category: a.subject.category === "BRIDGE_REFI" ? "Bridge / Refi" : a.subject.category === "CONSTRUCTION" ? "Construction" : "—",
    matchedCount: a.matchedCount,
    createdBy: a.createdBy,
    createdAt: a.createdAt,
    pinned: a.pinned,
  });
  const pinnedDeals = recent.filter((a) => a.pinned).map(toItem);
  const recentDeals = recent.filter((a) => !a.pinned).slice(0, 8).map(toItem);

  const tiles = [
    { href: "/deals/new", label: "New Deal Analysis", icon: Icons.deal },
    { href: "/comps/new", label: "Add a Comp", icon: Icons.add },
    { href: "/comps", label: "Search Comps", icon: Icons.search },
  ];

  return (
    <div className="space-y-10">
      <section>
        <div className="section-head">
          <h2>Quick Actions</h2>
          <div className="rule" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="tile">
              {t.icon}
              <span className="tile-label">{t.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <ActiveDealAnalyses title="Pinned Deals" analyses={pinnedDeals} />
      <ActiveDealAnalyses
        title="Recent Deal Analyses"
        analyses={recentDeals}
        emptyText="Nothing analyzed yet. Each analysis screens a subject deal against the comp database and saves it here."
      />

      {/* Health line */}
      <div className="text-xs text-slate-500 border-t border-accent/30 pt-3 flex gap-5">
        <span><b className="text-ink tabular-nums">{total.toLocaleString()}</b> comps</span>
        <span><b className="text-ink tabular-nums">{marketCount}</b> markets</span>
        <Link href="/comps" className="hover:text-accent">Search the comps →</Link>
      </div>
    </div>
  );
}

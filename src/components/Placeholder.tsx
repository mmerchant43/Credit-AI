// Shell placeholders — honest empty sections that name what will live there,
// so the homepage reads like the finished product from day one.
import Link from "next/link";

export interface AnalysisListItem {
  id: string;
  subjectName: string;
  location: string;
  category: string;
  matchedCount: number;
  createdBy: string | null;
  createdAt: Date;
}

export function ActiveDealAnalyses({ analyses }: { analyses: AnalysisListItem[] }) {
  return (
    <section>
      <div className="section-head">
        <h2>Recent Deal Analyses</h2>
        <div className="rule" />
      </div>
      {analyses.length === 0 ? (
        <div className="card p-4">
          <p className="text-sm text-slate-500">
            Nothing analyzed yet. Each analysis screens a subject deal against the comp database
            and saves it here.{" "}
            <Link href="/deals/new" className="text-accent underline">Start a new deal analysis</Link>.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {analyses.map((a) => (
            <Link key={a.id} href={`/deals/${a.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span className="text-sm">
                <b className="font-medium">{a.subjectName}</b>
                <span className="text-slate-500"> · {a.location} · {a.category}</span>
              </span>
              <span className="text-xs text-slate-400">
                {a.matchedCount} comp{a.matchedCount === 1 ? "" : "s"} · {a.createdBy ?? "—"} ·{" "}
                {a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-1">{title}</h1>
      <div className="card p-6 space-y-3">
        <span className="badge bg-amber-100 text-amber-800 border-amber-300">Coming next</span>
        <p className="text-sm text-slate-600">{description}</p>
        <Link href="/" className="btn text-sm">← Back to Home</Link>
      </div>
    </div>
  );
}

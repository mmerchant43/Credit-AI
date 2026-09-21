// Shell placeholders — honest empty sections that name what will live there,
// so the homepage reads like the finished product from day one.
import Link from "next/link";

export function ActiveDealAnalyses() {
  return (
    <section>
      <div className="section-head">
        <h2>Recent Deal Analyses</h2>
        <div className="rule" />
      </div>
      <div className="card p-4">
        <p className="text-sm text-slate-500">
          Nothing analyzed yet. This section will list the team's recent new-deal comparisons —
          each one a subject deal screened against the comp database.{" "}
          <Link href="/deals/new" className="text-accent underline">Start a new deal analysis</Link>.
        </p>
      </div>
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

// Homepage deal lists (Pinned + Recent) and the shell's ComingSoon card.
import Link from "next/link";
import PinStar from "./PinStar";

export interface AnalysisListItem {
  id: string;
  subjectName: string;
  location: string;
  category: string;
  matchedCount: number;
  createdBy: string | null;
  createdAt: Date;
  pinned: boolean;
}

export function ActiveDealAnalyses({
  title,
  analyses,
  emptyText,
}: {
  title: string;
  analyses: AnalysisListItem[];
  emptyText?: string;
}) {
  if (analyses.length === 0 && !emptyText) return null;
  return (
    <section>
      <div className="section-head">
        <h2>{title}</h2>
        <div className="rule" />
      </div>
      {analyses.length === 0 ? (
        <div className="card p-4">
          <p className="text-sm text-slate-500">
            {emptyText}{" "}
            <Link href="/deals/new" className="text-accent underline">Start a new deal analysis</Link>.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {analyses.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50">
              <PinStar id={a.id} pinned={a.pinned} />
              <Link href={`/deals/${a.id}`} className="flex flex-1 items-center justify-between gap-4 min-w-0">
                <span className="text-sm truncate">
                  <b className="font-medium">{a.subjectName}</b>
                  <span className="text-slate-500"> · {a.location} · {a.category}</span>
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {a.matchedCount} comp{a.matchedCount === 1 ? "" : "s"} · {a.createdBy ?? "—"} ·{" "}
                  {a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </Link>
            </div>
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

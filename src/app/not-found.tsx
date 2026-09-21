import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="card p-6 space-y-3 text-center">
        <div className="font-display text-2xl text-ink">Page not found</div>
        <p className="text-sm text-slate-500">That page doesn't exist (or moved).</p>
        <div className="flex justify-center">
          <Link href="/" className="btn btn-primary">← Home</Link>
        </div>
      </div>
    </div>
  );
}

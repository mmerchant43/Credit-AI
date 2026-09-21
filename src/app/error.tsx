"use client";
// Branded error boundary — without it, a server-side failure shows Next's
// raw "Application error" page with no way back.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="card p-6 space-y-3 text-center">
        <div className="font-display text-2xl text-ink">Something went wrong</div>
        <p className="text-sm text-slate-500">
          The page hit an error — usually temporary. Try again, and if it keeps
          happening, tell whoever maintains the site what you were doing.
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
          <a href="/" className="btn">← Home</a>
        </div>
      </div>
    </div>
  );
}

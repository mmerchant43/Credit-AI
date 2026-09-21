"use client";
// Sign-in: your name + one of the two shared team passwords (Analyst / Admin).
import { useState } from "react";

export default function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim()) { setErr("Enter your name — every record is attributed to a real person."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Sign-in failed.");
        return;
      }
      window.location.href = "/";
    } catch {
      setErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-center px-4 py-16">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="font-display text-2xl text-ink">
            Crow Holdings<span className="text-slate-400">:</span> <span className="italic text-accent">Credit Comp Database</span>
          </div>
          <div className="mt-2 mx-auto w-16 border-t border-accent/60" />
          <p className="text-sm text-slate-500 mt-3">The team's underwritten deal history. Sign in to continue.</p>
        </div>
        <div>
          <label className="label">Your Name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Team Password</label>
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

// Signed-cookie sessions — HMAC-SHA256 via Web Crypto so the SAME code runs
// in Node route handlers and the Edge middleware. No third-party auth: two
// shared team passwords (Analyst / Admin) live as Vercel env vars, mirroring
// the Industrial platform's model.

export const SESSION_COOKIE = "credit_session";
export const SESSION_TTL_HOURS = 24 * 14; // two weeks

export interface Session {
  name: string;
  role: "ANALYST" | "ADMIN";
  exp: number; // unix seconds
}

const encoder = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  // atob yields latin-1; the payload was UTF-8 — decode properly so names
  // like "José" survive the round trip.
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return toB64Url(sig);
}

export async function createSessionToken(name: string, role: "ANALYST" | "ADMIN", secret: string): Promise<string> {
  const session: Session = { name, role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_HOURS * 3600 };
  const payload = toB64Url(encoder.encode(JSON.stringify(session)));
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifySession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    if ((await hmac(payload, secret)) !== sig) return null;
    const session = JSON.parse(fromB64Url(payload)) as Session;
    if (!session?.name || (session.role !== "ANALYST" && session.role !== "ADMIN")) return null;
    if (typeof session.exp !== "number" || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

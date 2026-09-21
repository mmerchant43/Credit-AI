// Session → User row, so every comp is attributed to a real person by name.
// The middleware guarantees a valid signed cookie exists before any page or
// API runs; this helper turns it into a database User.
import { cookies } from "next/headers";
import { prisma } from "./db";
import { verifySession, SESSION_COOKIE } from "./session";

export async function currentSession() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return verifySession(cookies().get(SESSION_COOKIE)?.value, secret);
}

export async function currentUser() {
  const session = await currentSession();
  // Middleware should prevent this, but fail safe with a clear error.
  if (!session) throw new Error("Not signed in.");
  const slug = session.name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "user";
  const email = `${slug}@credit.local`;
  return prisma.user.upsert({
    where: { email },
    update: { name: session.name, role: session.role },
    create: { email, name: session.name, role: session.role },
  });
}

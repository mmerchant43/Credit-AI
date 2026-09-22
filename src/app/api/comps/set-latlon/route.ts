import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// Manual pin placement (Mason, 9/22/26): brand-new construction often isn't
// in ANY geocoder yet (Census lags years; even OSM misses fresh addresses),
// so the map's "Place pin" flow lets the user click the exact spot. Saved as
// address-level precision — the user pointed at the building themselves.
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const { id, lat, lon } = (await req.json()) as { id?: string; lat?: number; lon?: number };
    if (
      !id ||
      typeof lat !== "number" || !isFinite(lat) || lat < -90 || lat > 90 ||
      typeof lon !== "number" || !isFinite(lon) || lon < -180 || lon > 180
    ) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    const comp = await prisma.creditComp.findUnique({ where: { id } });
    if (!comp) return NextResponse.json({ error: "Comp not found." }, { status: 404 });

    await prisma.creditComp.update({
      where: { id },
      data: {
        lat, lon,
        geoPrecision: "address",
        notes: [comp.notes, `Map pin placed manually by ${user.name}`]
          .filter(Boolean).join("\n").slice(0, 8000),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/comps/set-latlon", e);
    return NextResponse.json({ error: "Could not save the pin." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geo";

// Add/fix a comp's street address from the map's "no address" panel
// (Mason, 9/22/26): saves the address, geocodes it (Census; the OM never
// stated it, so it's marked as user-provided), and the map picks up the new
// pin on refresh.
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const { id, address } = (await req.json()) as { id?: string; address?: string };
    const clean = (address ?? "").trim().slice(0, 200);
    if (!id || clean.length < 3) {
      return NextResponse.json({ error: "Enter a street address." }, { status: 400 });
    }
    const comp = await prisma.creditComp.findUnique({ where: { id } });
    if (!comp) return NextResponse.json({ error: "Comp not found." }, { status: 404 });

    const coords = await geocodeAddress(
      clean, comp.city ?? "", comp.state ?? "", comp.zip,
      // Existing zip-centroid coords guard against a wrong-city geocoder hit.
      comp.geoPrecision !== "address" && comp.lat != null && comp.lon != null
        ? [comp.lat, comp.lon]
        : null
    );
    await prisma.creditComp.update({
      where: { id },
      data: {
        address: clean,
        ...(coords ? { lat: coords[0], lon: coords[1], geoPrecision: "address" } : {}),
        notes: [comp.notes, `Address "${clean}" entered by ${user.name} (not OM-stated)${coords ? "" : " — could not be geocoded, pin unchanged"}`]
          .filter(Boolean).join("\n").slice(0, 8000),
      },
    });
    return NextResponse.json({ ok: true, geocoded: Boolean(coords) });
  } catch (e) {
    console.error("POST /api/comps/set-address", e);
    return NextResponse.json({ error: "Could not save the address." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { compInputSchema, toCompData } from "@/lib/compInput";

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const parsed = compInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    const { data, metricYears } = toCompData(parsed.data);
    // Sanctioned derivations (Mason, 9/22/26) — same math the import applies.
    if (data.totalProjectCost == null && data.loanAmount != null && data.loanAmount > 0 && data.ltcPct != null && data.ltcPct > 0.05 && data.ltcPct <= 1) {
      data.totalProjectCost = Math.round(data.loanAmount / data.ltcPct);
    }
    if (data.ltcPct == null && data.loanAmount != null && data.loanAmount > 0 && data.totalProjectCost != null && data.totalProjectCost > 0) {
      const r = data.loanAmount / data.totalProjectCost;
      if (r > 0.30 && r < 1.05) data.ltcPct = Math.round(r * 10000) / 10000; // senior-debt plausibility band
    }
    if (data.loanPerSf == null && data.loanAmount != null && data.loanAmount > 0 && data.sizeSf != null && data.sizeSf > 0) {
      data.loanPerSf = Math.round((data.loanAmount / data.sizeSf) * 100) / 100;
    }
    if (data.loanPerUnit == null && data.loanAmount != null && data.loanAmount > 0 && data.units != null && data.units > 0) {
      data.loanPerUnit = Math.round(data.loanAmount / data.units);
    }
    if (data.tpcPerUnit == null && data.totalProjectCost != null && data.totalProjectCost > 0 && data.units != null && data.units > 0) {
      data.tpcPerUnit = Math.round(data.totalProjectCost / data.units);
    }
    const comp = await prisma.creditComp.create({
      data: {
        ...data,
        enteredById: user.id,
        metricYears: { create: metricYears },
      },
    });
    return NextResponse.json({ id: comp.id });
  } catch (e) {
    console.error("POST /api/comps", e);
    return NextResponse.json({ error: "Could not save the comp." }, { status: 500 });
  }
}

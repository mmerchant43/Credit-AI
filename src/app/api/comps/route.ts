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

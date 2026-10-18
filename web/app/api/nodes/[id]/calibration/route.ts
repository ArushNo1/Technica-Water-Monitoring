import { NextResponse } from "next/server";
import { loadCalibration } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return NextResponse.json(await loadCalibration(params.id));
}

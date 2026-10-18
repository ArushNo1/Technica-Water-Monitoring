import { NextResponse } from "next/server";
import { loadNodes } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadNodes());
}

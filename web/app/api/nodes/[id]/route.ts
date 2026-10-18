import { NextResponse } from "next/server";
import { fail, loadNodes } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [node] = await loadNodes(params.id);
  return node ? NextResponse.json(node) : fail(404, "unknown node");
}

import { notFound } from "next/navigation";
import NodeDetail from "@/components/NodeDetail";
import { loadNodes } from "@/lib/hub";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const [node] = await loadNodes(params.id);
  if (!node) notFound();
  return <NodeDetail id={node.node_id} label={node.label ?? (node.type === "pipe" ? "Pipe module" : "Buoy")} />;
}

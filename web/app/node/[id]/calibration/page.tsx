import { notFound } from "next/navigation";
import CalibrationView from "@/components/CalibrationView";
import { loadNodes } from "@/lib/hub";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const [node] = await loadNodes(params.id);
  if (!node) notFound();
  return <CalibrationView id={node.node_id} label={node.label ?? (node.type === "pipe" ? "Pipe module" : "Buoy")} />;
}

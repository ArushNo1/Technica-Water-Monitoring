import LiveBoard from "@/components/LiveBoard";
import { loadNodes } from "@/lib/hub";

export const dynamic = "force-dynamic";

// Live view (what the poster QR opens). Server-renders the first frame, then LiveBoard polls.
export default async function Page() {
  return <LiveBoard initial={await loadNodes()} />;
}

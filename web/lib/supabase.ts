import { createClient } from "@supabase/supabase-js";

// Next 14 caches server fetches by default; readings must always be live.
export const noStore: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { global: { fetch: noStore } },
);

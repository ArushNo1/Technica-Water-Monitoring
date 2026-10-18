// Server-only: the secret key bypasses RLS. Never import this from a client component.
import { createClient } from "@supabase/supabase-js";
import { noStore } from "./supabase";

export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
  global: { fetch: noStore },
});

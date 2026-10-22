import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Second layer of the login wall (proxy.ts is the first, RLS/DEFINER checks in
 * Postgres are the third). Every admin page calls this before reading data.
 */
export async function requireAdmin(): Promise<{ supabase: Supabase; user: User }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isAdmin, error } = await supabase.rpc("is_superadmin");
  if (error || isAdmin !== true) redirect("/denied");
  return { supabase, user };
}

/** Same check for Server Actions, which must never redirect mid-mutation. */
export async function adminForAction(): Promise<
  { supabase: Supabase; user: User; error?: undefined } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data: isAdmin, error } = await supabase.rpc("is_superadmin");
  if (error || isAdmin !== true) return { error: "Only superadmins can do this." };
  return { supabase, user };
}

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

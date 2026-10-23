import type { createClient } from "@/lib/supabase/server";
import type { AdminUser, CaptionRow, Dataset, Generation, Img, Profile, Vote } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

const PAGE = 1000;
const MAX_PAGES = 50; // 50k rows per table is plenty for a class project.

/** PostgREST caps responses at 1000 rows; page through with stable ordering. */
async function fetchAll<T>(table: string, page: (from: number, to: number) => Page<T>) {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(`Could not read ${table} (${error.code ?? "unknown"}).`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export const captionColumns = "id, content, created_at, image_id, generation_id, admin_edited_at";
export const generationColumns =
  "id, user_id, image_id, model, prompt, user_input, created_at, generated_content, withdrawn_at";

/** Everything the dashboard needs, read through RLS as the signed-in superadmin. */
export async function loadDataset(supabase: Supabase): Promise<Dataset> {
  const [profiles, images, captions, votes, generations] = await Promise.all([
    fetchAll<Profile>("profiles", (a, b) =>
      supabase.from("profiles").select("id, first_name, last_name, avatar_url, is_superadmin").order("id").range(a, b)),
    fetchAll<Img>("images", (a, b) =>
      supabase.from("images").select("id, url, alt_text, user_id, created_at").order("id").range(a, b)),
    fetchAll<CaptionRow>("captions", (a, b) =>
      supabase.from("captions").select(captionColumns).order("id").range(a, b)),
    fetchAll<Vote>("caption_votes", (a, b) =>
      supabase.from("caption_votes").select("user_id, caption_id, value, updated_at")
        .order("user_id").order("caption_id").range(a, b)),
    fetchAll<Generation>("generations", (a, b) =>
      supabase.from("generations").select(generationColumns).order("id").range(a, b)),
  ]);
  return { profiles, images, captions, votes, generations };
}

export async function loadUsers(supabase: Supabase): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw new Error(`Could not read users (${error.code ?? "unknown"}).`);
  return (data ?? []) as AdminUser[];
}

export type WithdrawnCaption = {
  id: string; content: string; created_at: string; deleted_at: string;
  image_id: string; generation_id: string | null;
  /** Who hid it (migration 011): the author (Trash) or an admin (Removed). */
  deleted_by: "author" | "admin" | null;
};

export async function loadWithdrawn(supabase: Supabase): Promise<WithdrawnCaption[]> {
  const { data, error } = await supabase.rpc("admin_list_withdrawn_captions");
  if (error) throw new Error(`Could not read hidden captions (${error.code ?? "unknown"}).`);
  return (data ?? []) as WithdrawnCaption[];
}

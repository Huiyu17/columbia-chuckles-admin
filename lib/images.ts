import type { createClient } from "@/lib/supabase/server";
import type { PickerImage } from "@/components/ImagePicker";
import { displayName } from "@/lib/stats";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Photos for the picker: every sample + recent uploads, labelled with the uploader. */
export async function loadPickerImages(supabase: Supabase): Promise<PickerImage[]> {
  const [{ data: images, error }, { data: profiles }] = await Promise.all([
    supabase.from("images").select("id, url, alt_text, user_id, created_at")
      .order("created_at", { ascending: false }).limit(400),
    supabase.from("profiles").select("id, first_name, last_name"),
  ]);
  if (error) throw new Error(`Could not read images (${error.code ?? "unknown"}).`);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, displayName(p, "a student")]));
  return (images ?? []).map((i) => ({
    id: i.id, url: i.url, alt_text: i.alt_text, user_id: i.user_id,
    owner: i.user_id ? names.get(i.user_id) ?? "a student" : undefined,
  }));
}

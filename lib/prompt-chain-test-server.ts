import type { createClient } from "./supabase/server";
import type { RecordRow } from "./resources";
import type { ChainTestInput, TestConfig } from "./prompt-chain-test";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export async function configRows(supabase: Supabase, table: string): Promise<RecordRow[]> {
  const rows: RecordRow[] = [];
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await supabase.rpc("admin_resource_read", { resource: table, page_number: page, search_text: "" });
    if (error || !data) throw new Error("Workflow configuration could not be loaded. Refresh and try again.");
    const result = data as { rows: RecordRow[]; total: number };
    rows.push(...result.rows);
    if (rows.length >= result.total) return rows;
    if (!result.rows.length) break;
  }
  throw new Error("Workflow configuration is too large or incomplete to test safely.");
}
export async function loadChainTestConfig(supabase: Supabase, input: ChainTestInput, actorId: string): Promise<TestConfig> {
  const reads = await Promise.allSettled([
    configRows(supabase, "prompt_chains"), configRows(supabase, "prompt_chain_mix"), configRows(supabase, "prompt_chain_steps"),
    configRows(supabase, "llm_models"), configRows(supabase, "llm_providers"),
    supabase.from("images").select("id, url, alt_text, storage_path, user_id").eq("id", input.imageId).maybeSingle(),
    supabase.from("generations").select("generated_content").eq("user_id", actorId).not("generated_content", "is", null).order("created_at", { ascending: false }).limit(8),
  ]);
  const [chains, mix, steps, models, providers, image, recent] = reads;
  if (chains.status !== "fulfilled" || mix.status !== "fulfilled" || steps.status !== "fulfilled" || models.status !== "fulfilled" || providers.status !== "fulfilled") {
    throw new Error("Workflow configuration could not be loaded. Refresh and try again.");
  }
  if (image.status !== "fulfilled" || image.value.error || !image.value.data) throw new Error("This image could not be loaded. Choose another image.");
  if (recent.status !== "fulfilled" || recent.value.error) throw new Error("Recent caption context could not be loaded. Please retry the test.");
  return { chains: chains.value, mix: mix.value, steps: steps.value, models: models.value, providers: providers.value,
    image: image.value.data, recentCaptions: (recent.value.data ?? []).map(row => row.generated_content).filter((value): value is string => typeof value === "string" && !!value) };
}

export async function testPhoto(supabase: Supabase, image: RecordRow) {
  if (!image.storage_path) return;
  // Only the configured bucket is read. Client-supplied URLs are never fetched.
  const { data } = supabase.storage.from("caption-images").getPublicUrl(String(image.storage_path));
  const target = new URL(data.publicUrl);
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (target.origin !== origin.origin || !target.pathname.startsWith("/storage/v1/object/public/caption-images/")) throw new Error("This image is not in the configured caption image bucket.");
  const response = await fetch(target, { signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok || Number(response.headers.get("content-length")) > 5 * 1024 * 1024) throw new Error("The uploaded image could not be read. Use an accessible JPEG, PNG or WebP up to 5 MB.");
  const blob = await response.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error("The image is empty or exceeds the 5 MB limit.");
  const bytes = Buffer.from(await blob.arrayBuffer());
  const mime = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
    : bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP" ? "image/webp" : null;
  if (!mime) throw new Error("This image is not a supported JPEG, PNG or WebP.");
  return { type: "image" as const, data: bytes.toString("base64"), mime_type: mime as "image/jpeg" | "image/png" | "image/webp" };
}

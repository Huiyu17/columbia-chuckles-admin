"use server";

import { revalidatePath } from "next/cache";
import { adminForAction } from "@/lib/auth";
import { getResource } from "@/lib/resources";

export async function saveResource(key: string, operation: string, id: unknown, payload: Record<string, unknown>) {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  const resource = getResource(key);
  if (!resource || !["create", "update", "delete"].includes(operation) || resource.mode === "read" || (resource.mode === "update" && operation !== "update")) return { error: "This operation is not allowed." };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Invalid record." };
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 100_000) return { error: "Record is too large." };
  const { error } = await auth.supabase.rpc("admin_resource_write", {
    resource: resource.table, operation, row_id: id ?? null, payload,
  });
  if (error) return { error: `Could not ${operation} record: ${error.message}` };
  revalidatePath(`/manage/${key}`);
  return { success: true };
}

export async function uploadAdminImage(form: FormData): Promise<{ error?: string; success?: boolean }> {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return { error: "Choose an image up to 3 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpg"
    : [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) ? "png"
    : new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP" ? "webp" : null;
  if (!ext) return { error: "Only JPEG, PNG and WebP images are supported." };
  const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
  const bucket = auth.supabase.storage.from("caption-images");
  const { error } = await bucket.upload(path, bytes, { contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`, upsert: false });
  if (error) return { error: `Upload failed: ${error.message}` };
  const { data } = bucket.getPublicUrl(path);
  const result = await saveResource("images", "create", null, {
    url: data.publicUrl, storage_path: path, user_id: auth.user.id,
    alt_text: String(form.get("alt_text") ?? "").trim().slice(0, 1000),
  });
  if (result.error) {
    await bucket.remove([path]);
    return result;
  }
  return { success: true };
}

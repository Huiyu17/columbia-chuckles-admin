"use server";

import { GoogleGenAI } from "@google/genai";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminForAction, uuidPattern } from "@/lib/auth";
import { buildCaptionPrompt, captionProblem, jokeAngles, type HumorStyle } from "@/lib/caption-prompt";

export type FormState = { error?: string; success?: string };

const styles: HumorStyle[] = ["relatable", "deadpan", "absurd"];
const MANUAL_PROMPT = "Written manually by a superadmin in Backstage. No AI prompt was used.";
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

function dbError(code: string | undefined, fallback: string) {
  if (code === "42501") return "The database refused: this account is not a superadmin.";
  if (code === "22023") return "The database rejected the input (empty/too long text or unknown photo).";
  if (code === "PGRST202") return "Admin functions are missing. Run supabase/008_admin_panel.sql first.";
  return `${fallback} (code ${code ?? "unknown"})`;
}

/** Ask Gemini for a draft. Nothing is saved until the admin presses Publish. */
export async function draftCaption(input: { imageId: string; scene: string; style: string }) {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  const { imageId, scene, style } = input;
  if (!uuidPattern.test(imageId)) return { error: "Choose a photo first." };
  if (scene.trim().length < 5 || scene.trim().length > 500) return { error: "Describe the scene in 5–500 characters." };
  if (!styles.includes(style as HumorStyle)) return { error: "Choose a humor style." };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "GEMINI_API_KEY is not configured for the admin app. You can still write the caption manually." };
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  const { data: image, error } = await auth.supabase.from("images")
    .select("id, url, alt_text").eq("id", imageId).maybeSingle();
  if (error || !image) return { error: "That photo is unavailable." };

  // Only download from our own public Storage bucket, never an arbitrary URL.
  let photo: { type: "image"; data: string; mime_type: "image/jpeg" | "image/png" | "image/webp" } | undefined;
  const bucketPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/caption-images/`;
  if (image.url.startsWith(bucketPrefix)) {
    try {
      const res = await fetch(image.url, { signal: AbortSignal.timeout(15_000) });
      const bytes = Buffer.from(await res.arrayBuffer());
      const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg"
        : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp"
        : null;
      if (res.ok && mime && bytes.length <= 5 * 1024 * 1024) photo = { type: "image", data: bytes.toString("base64"), mime_type: mime };
    } catch {
      // Fall back to the text description; the draft is still useful.
    }
  }

  const prompt = buildCaptionPrompt({
    style: style as HumorStyle, scene, imageDescription: image.alt_text,
    hasPhoto: Boolean(photo), recentCaptions: [], angle: jokeAngles[randomInt(jokeAngles.length)],
  });
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.interactions.create(
      { model, input: photo ? [{ type: "text", text: prompt }, photo] : prompt, store: false },
      { timeout: 45_000, retries: { strategy: "none" } },
    );
    const content = result.output_text?.trim() ?? "";
    if (captionProblem(content, [])) return { error: "Gemini didn't return a short, usable caption. Try again." };
    return { content, prompt, model };
  } catch {
    return { error: "Gemini request failed or timed out. Try again, or write the caption manually." };
  }
}

/** CREATE: publish a new caption with provenance recorded in generations. */
export async function createCaption(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  const imageId = str(formData.get("imageId"));
  const content = str(formData.get("content")).trim();
  const draft = str(formData.get("draft")).trim();
  const aiPrompt = str(formData.get("prompt"));
  const aiModel = str(formData.get("model")).trim();
  const scene = str(formData.get("scene")).trim();
  if (!uuidPattern.test(imageId)) return { error: "Choose a photo." };
  if (content.length < 1 || content.length > 500) return { error: "The caption must be 1–500 characters." };

  const fromAi = Boolean(aiPrompt && aiModel && draft);
  const model = !fromAi ? "manual (admin)" : content === draft ? aiModel : `${aiModel} + admin edit`;
  const { data, error } = await auth.supabase.rpc("admin_create_caption", {
    p_image_id: imageId,
    p_content: content,
    p_user_input: (scene || "Created in Backstage").slice(0, 500),
    p_prompt: fromAi ? aiPrompt : MANUAL_PROMPT,
    p_model: model,
  });
  if (error || typeof data !== "string") return { error: dbError(error?.code, "Could not publish the caption") };
  revalidatePath("/", "layout");
  redirect(`/media/${data}?created=1`);
}

/** UPDATE: edit caption text and/or reassign its photo. */
export async function updateCaption(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  const id = str(formData.get("id"));
  const imageId = str(formData.get("imageId"));
  const content = str(formData.get("content")).trim();
  if (!uuidPattern.test(id) || !uuidPattern.test(imageId)) return { error: "Invalid caption or photo." };
  if (content.length < 1 || content.length > 500) return { error: "The caption must be 1–500 characters." };
  const { data, error } = await auth.supabase.rpc("admin_update_caption", {
    p_caption_id: id, p_content: content, p_image_id: imageId,
  });
  if (error) return { error: dbError(error.code, "Could not save changes") };
  if (data !== true) return { error: "This caption no longer exists. It may have been deleted." };
  revalidatePath("/", "layout");
  return { success: "Saved. The change is live in Explore." };
}

/** DELETE: permanent. Removes the caption and its votes; source photo is kept. */
export async function deleteCaption(id: string): Promise<FormState> {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  if (!uuidPattern.test(id)) return { error: "Invalid caption." };
  const { error } = await auth.supabase.rpc("admin_delete_caption", { p_caption_id: id });
  if (error) return { error: dbError(error.code, "Could not delete the caption") };
  // Retries of an already-deleted caption return false: treat as done.
  revalidatePath("/", "layout");
  redirect("/media?deleted=1");
}

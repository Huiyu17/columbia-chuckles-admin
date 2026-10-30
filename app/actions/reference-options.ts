"use server";

import { adminForAction, uuidPattern } from "@/lib/auth";
import { getResource } from "@/lib/resources";
import { referenceField, type ReferencePage } from "@/lib/reference-fields";
import { readReferenceOptions } from "@/lib/reference-options";

export async function searchReferenceOptions(resource: string, field: string, query: string, page: number, selectedId?: string): Promise<ReferencePage> {
  const empty: ReferencePage = { options: [], selected: [], total: 0, page: 1 };
  const auth = await adminForAction();
  if (auth.error !== undefined) return { ...empty, error: auth.error };
  const config = getResource(resource);
  if (!config || config.mode === "read" || !referenceField(field)
    || typeof query !== "string" || query.length > 200 || !Number.isInteger(page) || page < 1 || page > 100000
    || (selectedId !== undefined && (typeof selectedId !== "string" || !uuidPattern.test(selectedId)))) {
    return { ...empty, error: "Invalid record search." };
  }
  return readReferenceOptions(auth.supabase, field, query.trim(), page, selectedId ? [selectedId] : []);
}

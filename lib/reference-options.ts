import type { createClient } from "./supabase/server";
import type { Column, RecordRow } from "./resources";
import { referenceField, referenceOption, type ReferenceChoices, type ReferenceField, type ReferenceOption, type ReferencePage } from "./reference-fields";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const PAGE = 25;

/** Existing, admin-authorized read APIs only. Return display labels and full IDs,
 * never expose a service key or change a related record to populate a picker. */
export async function readReferenceOptions(supabase: Supabase, field: string, query = "", page = 1, selectedIds: string[] = []): Promise<ReferencePage> {
  const config = referenceField(field);
  const empty: ReferencePage = { options: [], selected: [], total: 0, page };
  if (!config) return { ...empty, error: "This field does not support record selection." };
  try {
    const selected = [...new Set(selectedIds)].slice(0, 25);
    if (config.table === "profiles") {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      const all = ((data ?? []) as RecordRow[]).map(row => referenceOption(field, row)).filter((option): option is ReferenceOption => !!option)
        .sort((a, b) => a.label.localeCompare(b.label));
      const filtered = all.filter(option => `${option.label} ${option.id}`.toLowerCase().includes(query.toLowerCase()));
      return { options: filtered.slice((page - 1) * PAGE, page * PAGE), selected: all.filter(option => selected.includes(option.id)), total: filtered.length, page };
    }
    if (config.table === "generations") {
      let request = supabase.from("generations").select("id, user_input, generated_content, model", { count: "exact" });
      if (query) request = request.ilike("user_input", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
      const { data, count, error } = await request.order("created_at", { ascending: false }).order("id").range((page - 1) * PAGE, page * PAGE - 1);
      if (error) throw error;
      const { data: current, error: currentError } = selected.length
        ? await supabase.from("generations").select("id, user_input, generated_content, model").in("id", selected)
        : { data: [], error: null };
      if (currentError) throw currentError;
      return { options: (data ?? []).map(row => referenceOption(field, row)!), selected: (current ?? []).map(row => referenceOption(field, row)!), total: count ?? 0, page };
    }
    const { data, error } = await supabase.rpc("admin_resource_read", { resource: config.table, page_number: page, search_text: query });
    if (error) throw error;
    const result = data as { rows: RecordRow[]; total: number };
    const options = result.rows.map(row => referenceOption(field, row)).filter((option): option is ReferenceOption => !!option);
    const current = options.filter(option => selected.includes(option.id));
    const missing = selected.filter(id => !current.some(option => option.id === id));
    const reads = await Promise.allSettled(missing.map(async id => {
      const lookup = await supabase.rpc("admin_resource_read", { resource: config.table, page_number: 1, search_text: id });
      if (lookup.error) throw lookup.error;
      const match = (lookup.data as { rows: RecordRow[] }).rows.find(row => String(row.id) === id);
      return match ? referenceOption(field, match) : undefined;
    }));
    for (const read of reads) if (read.status === "fulfilled" && read.value) current.push(read.value);
    return { options, selected: current, total: result.total, page,
      ...(reads.some(read => read.status === "rejected") ? { error: "Some current selections could not be loaded. You can keep the existing value or retry." } : {}) };
  } catch {
    return { ...empty, error: `Could not load ${config.plural}. Retry to load available choices.` };
  }
}

export async function loadReferenceChoices(supabase: Supabase, columns: Column[], rows: RecordRow[]): Promise<ReferenceChoices> {
  const fields = columns.filter(column => !column.primary && !column.generated && referenceField(column.name));
  const reads = await Promise.allSettled(fields.map(async column => {
    const ids = rows.map(row => row[column.name]).filter((id): id is string => typeof id === "string" && !!id);
    return [column.name, await readReferenceOptions(supabase, column.name, "", 1, ids)] as const;
  }));
  const choices: ReferenceChoices = {};
  for (const [index, read] of reads.entries()) {
    const field = fields[index].name as ReferenceField;
    choices[field] = read.status === "fulfilled" ? read.value[1] : { options: [], selected: [], total: 0, page: 1, error: "Choices could not be loaded. Please retry." };
  }
  return choices;
}

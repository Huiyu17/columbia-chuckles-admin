import type { Column, RecordRow } from "./resources";

export function fieldValue(column: Column, value: unknown): string {
  if (value == null) return "";
  return /json|\[\]/.test(column.type) ? JSON.stringify(value, null, 2) : String(value);
}

export function resourcePayload(columns: Column[], form: FormData, creating: boolean): RecordRow {
  const payload: RecordRow = {};
  for (const column of columns) {
    const value = String(form.get(column.name) ?? "");
    if (form.get(`null:${column.name}`) === "on") {
      if (column.required) throw new Error(`${column.name} cannot be null.`);
      payload[column.name] = null;
    } else if (creating && value === "" && column.default_value !== null) {
      continue;
    } else if (value === "") {
      payload[column.name] = column.required && /text|char/.test(column.type) ? "" : null;
    } else if (/json|\[\]/.test(column.type)) {
      try { payload[column.name] = JSON.parse(value); }
      catch { throw new Error(`Enter valid JSON for ${column.name}.`); }
      if (/\[\]/.test(column.type) && !Array.isArray(payload[column.name])) {
        throw new Error(`${column.name} must be a JSON array.`);
      }
    } else {
      payload[column.name] = column.type === "boolean" ? value === "true" : value;
    }
  }
  return payload;
}

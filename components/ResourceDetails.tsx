import Link from "next/link";
import Image from "next/image";
import type { RecordRow } from "@/lib/resources";
import { relatedRecordHref } from "@/lib/resources";
import type { ReferenceChoices } from "@/lib/reference-fields";
import type { SummaryRelations } from "@/lib/resource-summary";
import { resourceDate } from "@/lib/resource-summary";

const fields: Record<string, [string, string][]> = {
  terms: [["term", "Term"], ["definition", "Definition"]],
  "generation-examples": [["prompt", "Example input"], ["response", "Expected response"]],
  "llm-models": [["name", "Model name"], ["description", "Description"]],
  "llm-providers": [["name", "Provider name"], ["description", "Description"]],
  "signup-domains": [["domain", "Allowed email domain"]],
  "whitelisted-emails": [["email", "Allowed email address"]],
  images: [["alt_text", "Image description"]],
};
const relationsLabels: Record<string, string> = { provider_id: "Provider", llm_model_id: "Model", image_id: "Example image", prompt_chain_id: "Prompt chain", user_id: "Uploaded by" };
export default function ResourceDetails({ resource, row, choices, relations }: { resource: string; row: RecordRow; choices: ReferenceChoices; relations: SummaryRelations }) {
  const entries = fields[resource] ?? [];
  const headingField = entries[0]?.[0];
  return <div className="readable-content stack-md"><h2 className="resource-card-title">{typeof row[headingField] === "string" ? String(row[headingField]) : "Entry"}</h2>
    {resource === "images" && typeof row.url === "string" && /^https?:\/\//.test(row.url) && <Image unoptimized width={480} height={300} className="resource-image" src={row.url} alt={typeof row.alt_text === "string" ? row.alt_text : "Image"} />}
    <dl className="resource-record">
    {entries.slice(1).filter(([field]) => row[field] != null).map(([field, label]) => <div key={field}><dt>{label}</dt><dd className="readable-value">{typeof row[field] === "string" || typeof row[field] === "number" ? String(row[field]) : "Not available"}</dd></div>)}
    {Object.entries(relationsLabels).filter(([field])=>row[field] != null).map(([field,label])=>{
      const value=String(row[field]);
      const options=choices[field as keyof ReferenceChoices];
      const related=field==='provider_id'?relations.providers[value]:field==='llm_model_id'?relations.models[value]:field==='prompt_chain_id'?relations.chains[value]:field==='user_id'?relations.users[value]:undefined;
      const name=options?.options.find(option=>option.id===value)?.label ?? options?.selected.find(option=>option.id===value)?.label
        ?? (related ? String(related.name ?? [related.first_name,related.last_name].filter(Boolean).join(' ')) : "Related record");
      const href=relatedRecordHref(field,value);
      return <div key={field}><dt>{label}</dt><dd>{href?<Link className="link-strong" href={href}>{name || "View related record"}</Link>:name}</dd></div>;
    })}
    {[['created_at','Created'],['updated_at','Last updated']].filter(([field])=>row[field]!=null).map(([field,label])=><div key={field}><dt>{label}</dt><dd>{resourceDate(row[field]) ?? "Not recorded"}</dd></div>)}
  </dl></div>;
}

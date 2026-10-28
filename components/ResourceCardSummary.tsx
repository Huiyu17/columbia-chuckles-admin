import Image from "next/image";
import Link from "next/link";
import { resourceDate, summarizeResource, type SummaryRelations } from "@/lib/resource-summary";
import type { RecordRow } from "@/lib/resources";

export default function ResourceCardSummary({ resource, row, relations }: {
  resource: string; row: RecordRow; relations: SummaryRelations;
}) {
  const summary = summarizeResource(resource, row, relations);
  const date = resourceDate(row.created_at);
  return <div className="stack-sm">
    <h2 className="resource-card-title">{summary.title}</h2>
    {resource === "images" && typeof row.url === "string" && /^https?:\/\//.test(row.url) &&
      <a href={row.url} target="_blank" rel="noreferrer" aria-label={`Open image: ${summary.title}`}>
        <Image unoptimized width={480} height={300} className="resource-image" src={row.url}
          alt={typeof row.alt_text === "string" ? row.alt_text : "Image preview"} />
      </a>}
    {summary.preview && <p className="resource-preview muted">
      {summary.previewLabel && <strong>{summary.previewLabel}: </strong>}{summary.preview}
    </p>}
    <div className="row resource-summary-meta">
      {summary.status && <span className="resource-state-group">
        {summary.statusLabel && <span className="small muted">{summary.statusLabel}:</span>}
        <span className={`resource-status resource-status-${summary.tone ?? "neutral"}`}>
          {summary.status.charAt(0).toUpperCase() + summary.status.slice(1).replaceAll("_", " ")}
        </span>
      </span>}
      {summary.caption && <span className="resource-state-group">
        <span className="small muted">Caption:</span>
        <span className={`resource-status resource-status-${summary.caption.tone}`}>{summary.caption.label}</span>
      </span>}
      {summary.facts.length > 0 && <dl className="resource-meta small muted">
        {summary.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
      </dl>}
    </div>
    {summary.caption && <p className="small muted resource-caption-note">
      {summary.caption.description}{summary.caption.href && <> <Link className="link-strong" href={summary.caption.href}>
        {summary.caption.state === "published" ? "View caption" : "Review caption"} →
      </Link></>}
    </p>}
    {date && <p className="small muted"><time dateTime={String(row.created_at)}>{date}</time></p>}
  </div>;
}

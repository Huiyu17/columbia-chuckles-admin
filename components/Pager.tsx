import Link from "next/link";
import { hrefWith } from "@/lib/format";

export default function Pager({ base, params, page, pages, totalLabel }: {
  base: string; params: Record<string, string | undefined>; page: number; pages: number; totalLabel: string;
}) {
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted small">{totalLabel}</span>
      <span className="pager-links">
        {page > 1
          ? <Link className="button button-ghost" href={hrefWith(base, { ...params, page: page - 1 })}>← Prev</Link>
          : <span className="button button-ghost" aria-disabled="true">← Prev</span>}
        <span className="small">Page {page} of {Math.max(1, pages)}</span>
        {page < pages
          ? <Link className="button button-ghost" href={hrefWith(base, { ...params, page: page + 1 })}>Next →</Link>
          : <span className="button button-ghost" aria-disabled="true">Next →</span>}
      </span>
    </nav>
  );
}

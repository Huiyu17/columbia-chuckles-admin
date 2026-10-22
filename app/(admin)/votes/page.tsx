import Link from "next/link";
import Pager from "@/components/Pager";
import Thumb from "@/components/Thumb";
import { Legend, SplitBars, voteLegend } from "@/components/charts";
import { requireAdmin } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { fmtDateTime, fmtNum, fmtPct, pageNumber, param } from "@/lib/format";
import { buildIndex, displayName, laughRate, type Tally } from "@/lib/stats";

const PER_PAGE = 40;

export default async function VotesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const value = param(sp.value) === "up" ? "up" : param(sp.value) === "down" ? "down" : "";
  const q = param(sp.q).trim();
  const ds = await loadDataset(supabase);
  const ix = buildIndex(ds);
  const captionById = new Map(ds.captions.map((c) => [c.id, c]));

  const overall: Tally = { up: ds.votes.filter((v) => v.value > 0).length, down: ds.votes.filter((v) => v.value < 0).length };
  const perVoter = new Map<string, Tally>();
  for (const v of ds.votes) {
    const t = perVoter.get(v.user_id) ?? { up: 0, down: 0 };
    if (v.value > 0) t.up++; else t.down++;
    perVoter.set(v.user_id, t);
  }
  const voters = [...perVoter.entries()].map(([id, t]) => ({ id, t, name: displayName(ix.profiles.get(id), "Unnamed student") }));
  const mostActive = [...voters].sort((a, b) => (b.t.up + b.t.down) - (a.t.up + a.t.down)).slice(0, 5);
  const toughest = voters.filter((v) => v.t.up + v.t.down >= 3)
    .sort((a, b) => (laughRate(a.t) ?? 0) - (laughRate(b.t) ?? 0)).slice(0, 5);
  const selfVotes = ds.votes.filter((v) => {
    const c = captionById.get(v.caption_id);
    return c && ix.authorOf(c) === v.user_id;
  }).length;

  let rows = ds.votes.map((v) => ({
    v, caption: captionById.get(v.caption_id),
    voter: displayName(ix.profiles.get(v.user_id), "Unnamed student"),
  }));
  if (value) rows = rows.filter((r) => (value === "up" ? r.v.value > 0 : r.v.value < 0));
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => `${r.voter} ${r.caption?.content ?? ""}`.toLowerCase().includes(needle));
  }
  rows.sort((a, b) => b.v.updated_at.localeCompare(a.v.updated_at));
  const pages = Math.ceil(rows.length / PER_PAGE);
  const page = Math.min(pageNumber(sp.page), Math.max(1, pages));
  const visible = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <span className="eyebrow">Votes · read only</span>
          <h1>Every “Made me laugh” and “Not quite”</h1>
          <p className="muted">
            {fmtNum(ds.votes.length)} votes on live captions from {fmtNum(voters.length)} voters ·
            {" "}{selfVotes} self-vote{selfVotes === 1 ? "" : "s"} (authors rating their own caption)
          </p>
        </div>
      </header>

      <div className="grid-3">
        <section className="panel">
          <div className="panel-head"><h2>Overall split</h2><Legend items={voteLegend} /></div>
          <SplitBars rows={[{ label: "All votes", tally: overall }]} />
        </section>
        <section className="panel">
          <h2>Most active voters</h2>
          <VoterList rows={mostActive} empty="No votes yet." />
        </section>
        <section className="panel">
          <h2>Toughest crowd</h2>
          <p className="muted small">Lowest laugh rate given (3+ votes).</p>
          <VoterList rows={toughest} empty="Nobody has 3+ votes yet." />
        </section>
      </div>

      <form className="filters" role="search">
        <label className="field grow">
          <span>Search</span>
          <input name="q" defaultValue={q} placeholder="Voter name or caption text" />
        </label>
        <label className="field">
          <span>Vote</span>
          <select name="value" defaultValue={value}>
            <option value="">Both</option>
            <option value="up">Made me laugh (+1)</option>
            <option value="down">Not quite (−1)</option>
          </select>
        </label>
        <button className="button button-primary">Apply</button>
        {(q || value) && <Link href="/votes" className="button button-ghost">Clear</Link>}
      </form>

      <section className="panel table-panel">
        {visible.length === 0 ? <p className="empty-state muted">No votes match these filters.</p> : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Vote</th>
                  <th scope="col">Voter</th>
                  <th scope="col">Caption</th>
                  <th scope="col">Last changed</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ v, caption, voter }) => {
                  const img = caption ? ix.images.get(caption.image_id) : undefined;
                  return (
                    <tr key={`${v.user_id}-${v.caption_id}`}>
                      <td><span className={v.value > 0 ? "vote-chip vote-up" : "vote-chip vote-down"}>{v.value > 0 ? "▲ +1" : "▼ −1"}</span></td>
                      <td><Link href={`/users/${v.user_id}`} className="link-strong">{voter}</Link></td>
                      <td>
                        <Link href={`/media/${v.caption_id}`} className="caption-cell">
                          <Thumb url={img?.url} alt={img?.alt_text} size="sm" />
                          <span className="clamp-2">“{caption?.content ?? "Caption"}”</span>
                        </Link>
                      </td>
                      <td className="nowrap">{fmtDateTime(v.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/votes" params={{ q: q || undefined, value: value || undefined }} page={page} pages={pages}
          totalLabel={`${rows.length} vote${rows.length === 1 ? "" : "s"}`} />
      </section>
    </div>
  );
}

function VoterList({ rows, empty }: { rows: { id: string; name: string; t: Tally }[]; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <ol className="leaderboard">
      {rows.map((r, i) => (
        <li key={r.id}>
          <span className="rank">{i + 1}</span>
          <Link href={`/users/${r.id}`} className="link-strong">{r.name}</Link>
          <span className="muted small">{r.t.up + r.t.down} votes · {fmtPct(laughRate(r.t))} laughs</span>
        </li>
      ))}
    </ol>
  );
}

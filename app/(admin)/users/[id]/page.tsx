import Link from "next/link";
import { notFound } from "next/navigation";
import Avatar from "@/components/Avatar";
import Thumb from "@/components/Thumb";
import { TallyPill } from "@/components/charts";
import { requireAdmin, uuidPattern } from "@/lib/auth";
import { loadDataset, loadUsers } from "@/lib/data";
import { fmtDate, fmtDateTime, fmtPct } from "@/lib/format";
import { buildIndex, displayName, laughRate, type Tally } from "@/lib/stats";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const [users, ds] = await Promise.all([loadUsers(supabase), loadDataset(supabase)]);
  const user = users.find((u) => u.id === id);
  if (!user) notFound();

  const ix = buildIndex(ds);
  const captions = ds.captions.filter((c) => ix.authorOf(c) === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const received: Tally = captions.reduce((t, c) => {
    const x = ix.tallies.get(c.id)!;
    return { up: t.up + x.up, down: t.down + x.down };
  }, { up: 0, down: 0 });
  const votes = ds.votes.filter((v) => v.user_id === id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const captionById = new Map(ds.captions.map((c) => [c.id, c]));
  const generations = ds.generations.filter((g) => g.user_id === id);
  const drafts = generations.filter((g) => g.generated_content && !g.withdrawn_at
    && !ds.captions.some((c) => c.generation_id === g.id)).length;
  const withdrawn = generations.filter((g) => g.withdrawn_at).length;
  const given = { up: votes.filter((v) => v.value > 0).length, down: votes.filter((v) => v.value < 0).length };

  return (
    <div className="stack-lg">
      <Link href="/users" className="back-link">← All users</Link>
      <header className="panel profile-head">
        <Avatar url={user.avatar_url} name={displayName(user, user.email ?? "?")} />
        <div>
          <h1>{displayName(user, "Profile incomplete")} {user.is_superadmin && <span className="badge badge-admin">Superadmin</span>}</h1>
          <p className="muted">{user.email ?? "no email"}</p>
          <p className="muted small mono">{user.id}</p>
        </div>
        <dl className="facts">
          <div><dt>Joined</dt><dd>{fmtDate(user.created_at)}</dd></div>
          <div><dt>Last sign-in</dt><dd>{fmtDateTime(user.last_sign_in_at)}</dd></div>
          <div><dt>Live captions</dt><dd>{captions.length}</dd></div>
          <div><dt>Private drafts</dt><dd>{drafts}</dd></div>
          <div><dt>Withdrawn</dt><dd>{withdrawn}</dd></div>
          <div><dt>Laugh rate received</dt><dd>{fmtPct(laughRate(received))}</dd></div>
          <div><dt>Votes cast</dt><dd>{votes.length} ({given.up} ▲ / {given.down} ▼)</dd></div>
        </dl>
      </header>

      <div className="grid-2">
        <section className="panel">
          <h2>Published captions</h2>
          {captions.length === 0 ? <p className="muted">No live captions.</p> : (
            <ul className="rank-list">
              {captions.map((c) => {
                const img = ix.images.get(c.image_id);
                return (
                  <li key={c.id}>
                    <Thumb url={img?.url} alt={img?.alt_text} size="sm" />
                    <div className="rank-text">
                      <Link href={`/media/${c.id}`} className="caption-quote">“{c.content}”</Link>
                      <span className="muted small">{fmtDate(c.created_at)}</span>
                    </div>
                    <TallyPill tally={ix.tallies.get(c.id)!} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>Recent votes</h2>
          {votes.length === 0 ? <p className="muted">This user hasn&apos;t voted on any live caption.</p> : (
            <ul className="vote-list">
              {votes.slice(0, 25).map((v) => (
                <li key={v.caption_id}>
                  <span className={v.value > 0 ? "vote-chip vote-up" : "vote-chip vote-down"}>
                    {v.value > 0 ? "▲ Laugh" : "▼ Not quite"}
                  </span>
                  <Link href={`/media/${v.caption_id}`} className="clamp-1">
                    “{captionById.get(v.caption_id)?.content ?? "Caption"}”
                  </Link>
                  <span className="muted small nowrap">{fmtDate(v.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

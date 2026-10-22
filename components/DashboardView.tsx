import Link from "next/link";
import SectionNav, { type NavSection } from "./SectionNav";
import Thumb from "./Thumb";
import { DailyCaptions, DailyVotes, Legend, SplitBars, TallyPill, VoteHeatmap, voteLegend } from "./charts";
import { fmtNum, fmtPct, shortDay } from "@/lib/format";
import { HOUR_BLOCKS, WEEKDAYS, total, type Dashboard } from "@/lib/stats";

const styleLabels: Record<string, string> = {
  relatable: "Relatable", deadpan: "Deadpan", absurd: "Absurd",
  manual: "Written by admins", unknown: "Seed / unknown",
};
const MIN_VOTES = 3; // a group needs this many votes before we call it a "winner"

const sections: NavSection[] = [
  { id: "overview", label: "Overview", hint: "Totals & trends" },
  { id: "humor", label: "Humor insights", hint: "What gets laughs" },
  { id: "community", label: "Community insights", hint: "Who creates & how" },
];

type Takeaway = { label: string; value: string; note?: string };

export default function DashboardView({ d, generatedAt }: { d: Dashboard; generatedAt: string }) {
  const { kpis, funnel } = d;
  const winner = <T extends { tally: { up: number; down: number }; rate: number | null }>(rows: T[]) =>
    rows.filter((r) => total(r.tally) >= MIN_VOTES).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0];

  const bestStyle = winner(d.styles.filter((s) => s.key !== "unknown"));
  const bestLength = winner(d.lengths);
  const bestSource = winner(d.photoSources);
  const busiestDay = [...d.days].sort((a, b) => (b.laughs + b.groans) - (a.laughs + a.groans))[0];
  const topCreator = d.creators[0];
  const publishRate = funnel.previews ? (funnel.live + funnel.withdrawn) / funnel.previews : null;
  const funnelMax = Math.max(1, funnel.previews);

  const overviewTakeaways: Takeaway[] = [
    { label: "Peak voting time", value: d.peak.count ? `${WEEKDAYS[d.peak.weekday]} ${HOUR_BLOCKS[d.peak.block]}` : "—",
      note: d.peak.count ? `${d.peak.count} votes in that slot` : "No votes yet" },
    { label: "Busiest day (30 days)", value: busiestDay && busiestDay.laughs + busiestDay.groans ? shortDay(busiestDay.day) : "—",
      note: busiestDay ? `${busiestDay.laughs + busiestDay.groans} votes` : undefined },
    { label: "This week", value: `+${kpis.captionsThisWeek} captions`, note: `${kpis.votesThisWeek} votes cast or changed` },
  ];
  const humorTakeaways: Takeaway[] = [
    { label: "Funniest style", value: bestStyle ? styleLabels[bestStyle.key] : "Not enough votes",
      note: bestStyle ? `${fmtPct(bestStyle.rate)} laugh rate` : `Needs ${MIN_VOTES}+ votes per style` },
    { label: "Best caption length", value: bestLength ? `${bestLength.label.replace(" words", "")} words` : "Not enough votes",
      note: bestLength ? `${fmtPct(bestLength.rate)} laugh rate` : undefined },
    { label: "Funnier photos", value: bestSource ? (bestSource.key === "sample" ? "Sample photos" : "Student uploads") : "Not enough votes",
      note: bestSource ? `${fmtPct(bestSource.rate)} laugh rate` : undefined },
  ];
  const communityTakeaways: Takeaway[] = [
    { label: "Top creator", value: topCreator?.name ?? "—", note: topCreator ? `${topCreator.tally.up} laughs received` : "No student captions yet" },
    { label: "AI drafts that get published", value: fmtPct(publishRate),
      note: `${fmtNum(funnel.live + funnel.withdrawn)} of ${fmtNum(funnel.previews)} drafts` },
    { label: "Most captioned photo", value: d.topPhoto ? `${d.topPhoto.captions} captions` : "—",
      note: d.topPhoto?.image?.alt_text },
  ];

  return (
    <div className="dashboard">
      <header className="page-head">
        <div>
          <span className="eyebrow">Laugh report</span>
          <h1>How funny is Columbia right now?</h1>
          <p className="muted">Live numbers from the Columbia Chuckles database · {generatedAt} · New York time</p>
        </div>
        <Link href="/media/new" className="button button-primary">+ Create AI caption</Link>
      </header>

      <SectionNav sections={sections} />

      {/* ---------------- 01 OVERVIEW ---------------- */}
      <section id="overview" className="dash-section" aria-labelledby="overview-title">
        <SectionHead n={1} id="overview-title" title="Overview" question="How busy is the platform, and when?" />
        <div className="kpis">
          <Kpi label="Laugh rate" value={fmtPct(kpis.laughRate)}
            note={`share of ${fmtNum(kpis.votes)} votes that were “Made me laugh”`} accent />
          <Kpi label="Live captions" value={fmtNum(kpis.captions)} note={`+${kpis.captionsThisWeek} in the last 7 days`} />
          <Kpi label="Votes" value={fmtNum(kpis.votes)} note={`from ${fmtNum(kpis.voters)} different voters`} />
          <Kpi label="Users" value={fmtNum(kpis.users)} note={`${kpis.admins} superadmin${kpis.admins === 1 ? "" : "s"}`} />
        </div>
        <Takeaways items={overviewTakeaways} />
        <div className="grid-trend">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Daily activity</h3>
                <p className="muted small">Votes per day over the last 30 days. Hover a bar for exact numbers.</p>
              </div>
              <Legend items={voteLegend} />
            </div>
            <div className="chart-scroll"><DailyVotes days={d.days} /></div>
            <h4 className="chart-sub">New captions per day</h4>
            <div className="chart-scroll"><DailyCaptions days={d.days} /></div>
          </article>
          <article className="panel">
            <h3 className="panel-title">When people vote</h3>
            <p className="muted small panel-sub">Each square is a 2-hour slot. Darker = more votes.</p>
            <VoteHeatmap grid={d.heatmap} />
          </article>
        </div>
      </section>

      {/* ---------------- 02 HUMOR ---------------- */}
      <section id="humor" className="dash-section" aria-labelledby="humor-title">
        <SectionHead n={2} id="humor-title" title="Humor insights" question="What kind of caption makes Columbia laugh?" />
        <Takeaways items={humorTakeaways} />
        <div className="grid-3">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">By humor style</h3>
                <p className="muted small">The style chosen when the caption was created.</p>
              </div>
            </div>
            <SplitBars rows={d.styles.map((s) => ({
              label: styleLabels[s.key], sub: `${s.captions} caption${s.captions === 1 ? "" : "s"}`, tally: s.tally,
            }))} />
          </article>
          <article className="panel">
            <h3 className="panel-title">By caption length</h3>
            <p className="muted small panel-sub">Number of words in the caption.</p>
            <SplitBars rows={d.lengths.map((l) => ({ label: l.label, sub: `${l.captions} captions`, tally: l.tally }))} />
          </article>
          <article className="panel">
            <h3 className="panel-title">By photo source</h3>
            <p className="muted small panel-sub">Built-in sample photos vs. photos students uploaded.</p>
            <SplitBars rows={d.photoSources.map((s) => ({
              label: s.key === "sample" ? "Sample photos" : "Student uploads",
              sub: `${s.captions} captions`, tally: s.tally,
            }))} />
          </article>
        </div>
        <div className="reading-tip">
          <Legend items={voteLegend} />
          <span>Bars show the split of votes; the percentage is the laugh rate.</span>
        </div>
        <div className="grid-2">
          <article className="panel">
            <h3 className="panel-title">🏆 Hall of fame</h3>
            <p className="muted small panel-sub">
              Funniest captions. Ranking rewards both a high laugh rate and enough votes,
              so a single lucky vote can&apos;t win.
            </p>
            <RankList rows={d.hallOfFame} empty="No votes yet — the stage is empty." />
          </article>
          <article className="panel">
            <h3 className="panel-title">⚖️ Most divisive</h3>
            <p className="muted small panel-sub">Captions where the room split closest to 50/50.</p>
            <RankList rows={d.divisive} empty="Nothing divisive yet: every voted caption is unanimous." />
          </article>
        </div>
      </section>

      {/* ---------------- 03 COMMUNITY ---------------- */}
      <section id="community" className="dash-section" aria-labelledby="community-title">
        <SectionHead n={3} id="community-title" title="Community insights" question="Who is creating, and how do they use the AI?" />
        <Takeaways items={communityTakeaways} />
        <div className="grid-3">
          <article className="panel">
            <h3 className="panel-title">Top creators</h3>
            <p className="muted small panel-sub">Ranked by “Made me laugh” votes received.</p>
            {d.creators.length === 0 ? <p className="muted">No student-authored captions yet.</p> : (
              <ol className="leaderboard">
                {d.creators.map((c, i) => (
                  <li key={c.id}>
                    <span className="rank">{i + 1}</span>
                    <Link href={`/users/${c.id}`} className="link-strong">{c.name}</Link>
                    <span className="muted small">{c.captions} caption{c.captions === 1 ? "" : "s"} · {fmtPct(c.rate)} laugh rate</span>
                    <TallyPill tally={c.tally} />
                  </li>
                ))}
              </ol>
            )}
          </article>
          <article className="panel">
            <h3 className="panel-title">What happens to AI drafts</h3>
            <p className="muted small panel-sub">
              Every “Generate” makes a private draft. Students then publish it, or discard it and try again.
            </p>
            <ul className="funnel">
              <FunnelRow label="Drafts generated" value={funnel.previews} max={funnelMax} />
              <FunnelRow label="Published, still live" value={funnel.live} max={funnelMax} />
              <FunnelRow label="Published, later deleted" value={funnel.withdrawn} max={funnelMax} />
              <FunnelRow label="Never published" value={funnel.neverPublished} max={funnelMax} />
            </ul>
            <details className="details">
              <summary>Details</summary>
              <p className="muted small">
                {d.models.length > 0 && <>Models used: {d.models.map(([m, n]) => `${m} (${n})`).join(", ")}. </>}
                {funnel.legacy > 0 && <>{funnel.legacy} older caption{funnel.legacy === 1 ? "" : "s"} were added before AI generation existed and aren&apos;t counted here.</>}
              </p>
            </details>
          </article>
          <article className="panel spotlight">
            <h3 className="panel-title">Most captioned photo</h3>
            {d.topPhoto?.image ? (
              <div className="stack-sm spotlight-body">
                <Thumb url={d.topPhoto.image.url} alt={d.topPhoto.image.alt_text} size="lg" />
                <p><span className="big-number">{d.topPhoto.captions}</span> <span className="muted">live captions</span></p>
                <p className="small">{d.topPhoto.image.alt_text}</p>
                <Link className="link-strong small" href={`/media?image=${d.topPhoto.image.id}`}>See all its captions →</Link>
              </div>
            ) : <p className="muted">No captions yet.</p>}
          </article>
        </div>
      </section>
    </div>
  );
}

function SectionHead({ n, id, title, question }: { n: number; id: string; title: string; question: string }) {
  return (
    <div className="section-head">
      <span className="section-badge" aria-hidden="true">{String(n).padStart(2, "0")}</span>
      <div>
        <h2 id={id}>{title}</h2>
        <p className="muted">{question}</p>
      </div>
    </div>
  );
}

function Takeaways({ items }: { items: Takeaway[] }) {
  return (
    <ul className="takeaways" aria-label="Key takeaways">
      {items.map((t) => (
        <li key={t.label}>
          <span className="takeaway-label">{t.label}</span>
          <strong className="takeaway-value">{t.value}</strong>
          {t.note && <span className="takeaway-note">{t.note}</span>}
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className={accent ? "kpi kpi-accent" : "kpi"}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-note">{note}</span>
    </div>
  );
}

function FunnelRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li>
      <span className="funnel-label">{label}</span>
      <span className="funnel-track" aria-hidden="true"><span style={{ width: `${(value / max) * 100}%` }} /></span>
      <strong>{fmtNum(value)}</strong>
    </li>
  );
}

function RankList({ rows, empty }: { rows: Dashboard["hallOfFame"]; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <ol className="rank-list">
      {rows.map((r) => (
        <li key={r.caption.id}>
          <Thumb url={r.image?.url} alt={r.image?.alt_text} size="sm" />
          <div className="rank-text">
            <Link href={`/media/${r.caption.id}`} className="caption-quote">“{r.caption.content}”</Link>
            <span className="muted small">{r.author} · {fmtPct(r.tally.up / (r.tally.up + r.tally.down))} laughed</span>
          </div>
          <TallyPill tally={r.tally} />
        </li>
      ))}
    </ol>
  );
}

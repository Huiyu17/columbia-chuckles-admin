// Hand-built, dependency-free charts (server components).
// Colors: --laugh (orange, "Made me laugh") and --groan (blue, "Not quite");
// validated for colour-vision deficiency. Every chart also has text labels,
// native tooltips (<title>) and a legend, so meaning never relies on colour alone.
import { fmtNum, fmtPct, shortDay } from "@/lib/format";
import { HOUR_BLOCKS, WEEKDAYS, laughRate, total, type Tally } from "@/lib/stats";

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="legend" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label}><span className={`swatch ${i.className}`} aria-hidden="true" />{i.label}</li>
      ))}
    </ul>
  );
}

export const voteLegend = [
  { label: "Made me laugh", className: "swatch-laugh" },
  { label: "Not quite", className: "swatch-groan" },
];

/** Stacked daily bars: laughs on the baseline, groans on top. */
export function DailyVotes({ days }: { days: { day: string; laughs: number; groans: number }[] }) {
  const W = 720, H = 200, padL = 28, padB = 22, padT = 8;
  const max = Math.max(1, ...days.map((d) => d.laughs + d.groans));
  const step = (W - padL) / days.length;
  const bw = Math.max(3, step - 4);
  const y = (v: number) => ((H - padB - padT) * v) / max;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
      aria-label={`Votes per day for the last ${days.length} days`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={H - padB - y(t)} y2={H - padB - y(t)} className="grid" />
          <text x={padL - 6} y={H - padB - y(t) + 4} className="axis" textAnchor="end">{t}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = padL + i * step + (step - bw) / 2;
        const hl = y(d.laughs), hg = y(d.groans);
        const gap = d.laughs && d.groans ? 2 : 0;
        return (
          <g key={d.day} className="bar-group">
            <title>{`${shortDay(d.day)}: ${d.laughs} laughs, ${d.groans} not quite`}</title>
            <rect x={padL + i * step} y={padT} width={step} height={H - padB - padT} className="hit" />
            {d.laughs > 0 && <rect x={x} y={H - padB - hl} width={bw} height={hl} rx={2} className="fill-laugh" />}
            {d.groans > 0 && <rect x={x} y={H - padB - hl - hg - gap} width={bw} height={Math.max(0, hg)} rx={2} className="fill-groan" />}
            {((i % 7 === 0 && days.length - 1 - i >= 4) || i === days.length - 1) && (
              <text x={i === days.length - 1 ? x + bw : x + bw / 2} y={H - 6} className="axis"
                textAnchor={i === days.length - 1 ? "end" : "middle"}>{shortDay(d.day)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Single-series daily bars in ink. */
export function DailyCaptions({ days }: { days: { day: string; captions: number }[] }) {
  const W = 720, H = 90, padL = 28, padB = 4;
  const max = Math.max(1, ...days.map((d) => d.captions));
  const step = (W - padL) / days.length;
  const bw = Math.max(3, step - 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Captions published per day">
      <line x1={padL} x2={W} y1={H - padB} y2={H - padB} className="grid" />
      <text x={padL - 6} y={12} className="axis" textAnchor="end">{max}</text>
      {days.map((d, i) => {
        const h = ((H - padB - 6) * d.captions) / max;
        return (
          <g key={d.day} className="bar-group">
            <title>{`${shortDay(d.day)}: ${d.captions} caption${d.captions === 1 ? "" : "s"} published`}</title>
            <rect x={padL + i * step} y={0} width={step} height={H} className="hit" />
            {d.captions > 0 && <rect x={padL + i * step + (step - bw) / 2} y={H - padB - h} width={bw} height={h} rx={2} className="fill-ink" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Weekday × two-hour heatmap, single-hue sequential scale. */
export function VoteHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const level = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="table" aria-label="Votes by weekday and time of day (New York time)">
        <div role="row" className="heat-row heat-head">
          <span role="columnheader" />
          {HOUR_BLOCKS.map((h, b) => (
            <span role="columnheader" key={h} className="heat-col-label">{b % 3 === 0 ? h.split("–")[0] : ""}</span>
          ))}
        </div>
        {grid.map((row, w) => (
          <div role="row" className="heat-row" key={WEEKDAYS[w]}>
            <span role="rowheader" className="heat-row-label">{WEEKDAYS[w]}</span>
            {row.map((v, b) => (
              <span role="cell" key={b} className={`heat-cell heat-${level(v)}`}
                title={`${WEEKDAYS[w]} ${HOUR_BLOCKS[b]}: ${v} vote${v === 1 ? "" : "s"}`}>
                <span className="sr-only">{`${WEEKDAYS[w]} ${HOUR_BLOCKS[b]}: ${v}`}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="heat-scale" aria-hidden="true">
        <span>Fewer</span>
        {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heat-cell heat-${l}`} />)}
        <span>More</span>
      </div>
    </div>
  );
}

/** One row per group: a 100% split bar (laughs vs not quite) with labels. */
export function SplitBars({ rows }: { rows: { label: string; sub?: string; tally: Tally }[] }) {
  return (
    <ul className="split-list">
      {rows.map((r) => {
        const n = total(r.tally);
        const rate = laughRate(r.tally);
        return (
          <li key={r.label} className="split-row"
            title={`${r.label}: ${r.tally.up} laughs, ${r.tally.down} not quite`}>
            <div className="split-label">
              <strong>{r.label}</strong>
              {r.sub && <span className="muted small">{r.sub}</span>}
            </div>
            <div className="split-bar" aria-hidden="true">
              {n === 0 ? <span className="split-empty" /> : (
                <>
                  {r.tally.up > 0 && <span className="fill-laugh" style={{ flexGrow: r.tally.up }} />}
                  {r.tally.down > 0 && <span className="fill-groan" style={{ flexGrow: r.tally.down }} />}
                </>
              )}
            </div>
            <div className="split-value">
              <strong>{fmtPct(rate)}</strong>
              <span className="muted small">{n ? `${fmtNum(n)} vote${n === 1 ? "" : "s"}` : "no votes"}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TallyPill({ tally }: { tally: Tally }) {
  return (
    <span className="tally" aria-label={`${tally.up} made me laugh, ${tally.down} not quite`}>
      <span className="tally-up">▲ {tally.up}</span>
      <span className="tally-down">▼ {tally.down}</span>
    </span>
  );
}

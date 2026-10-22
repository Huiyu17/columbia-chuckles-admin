// Pure statistics over the admin dataset. No I/O: unit-testable with fixtures.
import type { CaptionRow, Dataset, Generation, Img, Profile } from "@/lib/types";

export const TIME_ZONE = "America/New_York";
export const STYLES = ["relatable", "deadpan", "absurd"] as const;
export type StyleKey = (typeof STYLES)[number] | "manual" | "unknown";

export type Tally = { up: number; down: number };
export const total = (t: Tally) => t.up + t.down;
export const laughRate = (t: Tally) => (total(t) ? t.up / total(t) : null);

/**
 * Lower bound of the Wilson score interval (95%). Ranks "3 of 3 laughed"
 * below "40 of 45 laughed", unlike a raw percentage.
 */
export function wilson({ up, down }: Tally, z = 1.96) {
  const n = up + down;
  if (!n) return 0;
  const p = up / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

export function styleOf(generation: Generation | undefined): StyleKey {
  if (!generation) return "unknown";
  if (generation.model.startsWith("manual")) return "manual";
  const match = /Humor style: (relatable|deadpan|absurd)\./.exec(generation.prompt);
  return (match?.[1] as StyleKey | undefined) ?? "unknown";
}

export function displayName(p: Pick<Profile, "first_name" | "last_name"> | undefined, fallback = "Unknown") {
  const name = [p?.first_name?.trim(), p?.last_name?.trim()].filter(Boolean).join(" ");
  return name || fallback;
}

const nyFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23", weekday: "short",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Calendar date, hour and weekday as seen on campus (New York time). */
export function campusTime(iso: string | Date) {
  const parts = Object.fromEntries(
    nyFormat.formatToParts(typeof iso === "string" ? new Date(iso) : iso).map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

export function buildIndex(ds: Dataset) {
  const profiles = new Map(ds.profiles.map((p) => [p.id, p]));
  const images = new Map(ds.images.map((i) => [i.id, i]));
  const generations = new Map(ds.generations.map((g) => [g.id, g]));
  const tallies = new Map<string, Tally>(ds.captions.map((c) => [c.id, { up: 0, down: 0 }]));
  for (const v of ds.votes) {
    const t = tallies.get(v.caption_id);
    if (!t) continue;
    if (v.value > 0) t.up++;
    else if (v.value < 0) t.down++;
  }
  const authorOf = (c: CaptionRow) =>
    c.generation_id ? generations.get(c.generation_id)?.user_id ?? null : null;
  return { profiles, images, generations, tallies, authorOf };
}
export type DataIndex = ReturnType<typeof buildIndex>;

export type RankedCaption = {
  caption: CaptionRow; image: Img | undefined; author: string; tally: Tally; score: number;
};

function sumTallies(list: Tally[]): Tally {
  return list.reduce((acc, t) => ({ up: acc.up + t.up, down: acc.down + t.down }), { up: 0, down: 0 });
}

export function computeDashboard(ds: Dataset, now = new Date()) {
  const ix = buildIndex(ds);
  const rank = (c: CaptionRow): RankedCaption => {
    const tally = ix.tallies.get(c.id)!;
    const authorId = ix.authorOf(c);
    return {
      caption: c, image: ix.images.get(c.image_id), tally, score: wilson(tally),
      author: authorId ? displayName(ix.profiles.get(authorId), "Unnamed student") : "Seed collection",
    };
  };
  const ranked = ds.captions.map(rank);
  const allVotes: Tally = sumTallies([...ix.tallies.values()]);

  // ----- headline numbers -----
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const kpis = {
    users: ds.profiles.length,
    admins: ds.profiles.filter((p) => p.is_superadmin).length,
    captions: ds.captions.length,
    captionsThisWeek: ds.captions.filter((c) => Date.parse(c.created_at) >= weekAgo).length,
    votes: total(allVotes),
    votesThisWeek: ds.votes.filter((v) => Date.parse(v.updated_at) >= weekAgo).length,
    laughRate: laughRate(allVotes),
    voters: new Set(ds.votes.map((v) => v.user_id)).size,
  };

  // ----- last 30 campus days -----
  const days: { day: string; laughs: number; groans: number; captions: number }[] = [];
  const dayIndex = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const day = campusTime(new Date(now.getTime() - i * 86_400_000)).day;
    if (dayIndex.has(day)) continue; // DST edge
    dayIndex.set(day, days.length);
    days.push({ day, laughs: 0, groans: 0, captions: 0 });
  }
  for (const v of ds.votes) {
    const slot = dayIndex.get(campusTime(v.updated_at).day);
    if (slot === undefined) continue;
    if (v.value > 0) days[slot].laughs++;
    else days[slot].groans++;
  }
  for (const c of ds.captions) {
    const slot = dayIndex.get(campusTime(c.created_at).day);
    if (slot !== undefined) days[slot].captions++;
  }

  // ----- when does campus vote? weekday x 2-hour block -----
  const heatmap = Array.from({ length: 7 }, () => Array<number>(12).fill(0));
  for (const v of ds.votes) {
    const t = campusTime(v.updated_at);
    if (t.weekday >= 0) heatmap[t.weekday][Math.floor(t.hour / 2)]++;
  }
  let peak = { weekday: -1, block: -1, count: 0 };
  heatmap.forEach((row, w) => row.forEach((count, b) => {
    if (count > peak.count) peak = { weekday: w, block: b, count };
  }));

  // ----- leaderboards -----
  const hallOfFame = ranked.filter((r) => total(r.tally) > 0)
    .sort((a, b) => b.score - a.score || total(b.tally) - total(a.tally)).slice(0, 5);
  const divisive = ranked.filter((r) => r.tally.up > 0 && r.tally.down > 0 && total(r.tally) >= 2)
    .map((r) => ({ ...r, split: Math.abs(r.tally.up - r.tally.down) / total(r.tally) }))
    .sort((a, b) => a.split - b.split || total(b.tally) - total(a.tally)).slice(0, 5);

  // ----- humor style showdown -----
  const styleBuckets = new Map<StyleKey, { captions: number; tally: Tally }>();
  for (const r of ranked) {
    const key = r.caption.generation_id ? styleOf(ix.generations.get(r.caption.generation_id)) : "unknown";
    const b = styleBuckets.get(key) ?? { captions: 0, tally: { up: 0, down: 0 } };
    b.captions++;
    b.tally = sumTallies([b.tally, r.tally]);
    styleBuckets.set(key, b);
  }
  const styleOrder: StyleKey[] = [...STYLES, "manual", "unknown"];
  const styles = styleOrder.filter((k) => styleBuckets.has(k))
    .map((key) => ({ key, ...styleBuckets.get(key)!, rate: laughRate(styleBuckets.get(key)!.tally) }));

  // ----- sample photos vs uploaded photos -----
  const sourceOf = (r: RankedCaption) => (r.image?.user_id ? "uploaded" : "sample");
  const photoSources = (["sample", "uploaded"] as const).map((key) => {
    const rows = ranked.filter((r) => sourceOf(r) === key);
    const tally = sumTallies(rows.map((r) => r.tally));
    return { key, captions: rows.length, tally, rate: laughRate(tally) };
  });

  // ----- caption length sweet spot -----
  const lengthBuckets = [
    { label: "≤ 8 words", max: 8 }, { label: "9–14", max: 14 },
    { label: "15–20", max: 20 }, { label: "21+", max: Infinity },
  ].map((b) => ({ ...b, captions: 0, tally: { up: 0, down: 0 } as Tally }));
  for (const r of ranked) {
    const words = r.caption.content.trim().split(/\s+/u).filter(Boolean).length;
    const b = lengthBuckets.find((x) => words <= x.max)!;
    b.captions++;
    b.tally = sumTallies([b.tally, r.tally]);
  }
  const lengths = lengthBuckets.map((b) => ({ label: b.label, captions: b.captions, tally: b.tally, rate: laughRate(b.tally) }));

  // ----- creators by laughs received -----
  const creatorMap = new Map<string, { captions: number; tally: Tally }>();
  for (const r of ranked) {
    const id = ix.authorOf(r.caption);
    if (!id) continue;
    const c = creatorMap.get(id) ?? { captions: 0, tally: { up: 0, down: 0 } };
    c.captions++;
    c.tally = sumTallies([c.tally, r.tally]);
    creatorMap.set(id, c);
  }
  const creators = [...creatorMap.entries()]
    .map(([id, c]) => ({ id, name: displayName(ix.profiles.get(id), "Unnamed student"), ...c, rate: laughRate(c.tally) }))
    .sort((a, b) => b.tally.up - a.tally.up || b.captions - a.captions).slice(0, 5);

  // ----- draft → publish funnel -----
  const liveByGeneration = new Set(ds.captions.map((c) => c.generation_id).filter(Boolean));
  const previews = ds.generations.filter((g) => g.generated_content !== null);
  const funnel = {
    previews: previews.length,
    live: previews.filter((g) => liveByGeneration.has(g.id)).length,
    withdrawn: previews.filter((g) => g.withdrawn_at).length,
    neverPublished: previews.filter((g) => !liveByGeneration.has(g.id) && !g.withdrawn_at).length,
    legacy: ds.captions.filter((c) => !c.generation_id).length,
  };
  const models = [...ds.generations.reduce((m, g) => m.set(g.model, (m.get(g.model) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 4);

  // ----- most captioned photo -----
  const perImage = new Map<string, number>();
  ds.captions.forEach((c) => perImage.set(c.image_id, (perImage.get(c.image_id) ?? 0) + 1));
  const topPhotoEntry = [...perImage.entries()].sort((a, b) => b[1] - a[1])[0];
  const topPhoto = topPhotoEntry
    ? { image: ix.images.get(topPhotoEntry[0]), captions: topPhotoEntry[1] }
    : null;

  return { kpis, days, heatmap, peak, hallOfFame, divisive, styles, photoSources, lengths, creators, funnel, models, topPhoto };
}
export type Dashboard = ReturnType<typeof computeDashboard>;

export const HOUR_BLOCKS = Array.from({ length: 12 }, (_, b) => {
  const fmt = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
  return `${fmt(b * 2)}–${fmt((b * 2 + 2) % 24)}`;
});
export { WEEKDAYS };

export default function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar" src={url} alt="" />
  ) : <span className="avatar avatar-fallback" aria-hidden="true">{initials || "?"}</span>;
}

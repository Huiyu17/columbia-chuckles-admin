export default function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className={inverted ? "brand brand-inverted" : "brand"}>
      <span className="brand-mark" aria-hidden="true">c<span>!</span></span>
      <span className="brand-text">
        <span className="brand-name">Columbia Chuckles<span className="brand-dot">.</span></span>
        <small>Backstage</small>
      </span>
    </span>
  );
}

"use client";
import { useEffect, useState } from "react";

export type NavSection = { id: string; label: string; hint: string };

/** Sticky in-page navigation with scroll-spy for the dashboard sections. */
export default function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // A section becomes "current" once its top passes just under the nav bar.
      { rootMargin: "-90px 0px -55% 0px" },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="section-nav" aria-label="Dashboard sections">
      {sections.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} className={active === s.id ? "section-link active" : "section-link"}
          aria-current={active === s.id ? "true" : undefined} onClick={() => setActive(s.id)}>
          <span className="section-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <span>
            <strong>{s.label}</strong>
            <span className="section-hint">{s.hint}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}

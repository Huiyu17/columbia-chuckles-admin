"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./BrandMark";
import LogoutButton from "./LogoutButton";
import { resources } from "@/lib/resources";

const links = [
  { href: "/", label: "Laugh report", icon: "◎" },
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/media", label: "AI media", icon: "▣" },
  { href: "/votes", label: "Votes", icon: "±" },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand" aria-label="Backstage home">
        <BrandMark inverted />
      </Link>
      <nav aria-label="Admin sections" className="sidebar-nav">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={isActive(l.href) ? "side-link active" : "side-link"}
            aria-current={isActive(l.href) ? "page" : undefined}>
            <span aria-hidden="true" className="side-icon">{l.icon}</span>
            {l.label}
          </Link>
        ))}
        <span className="sidebar-section">Generation & access</span>
        {Object.entries(resources).map(([key, resource]) => (
          <Link key={key} href={`/manage/${key}`}
            className={isActive(`/manage/${key}`) ? "side-link active" : "side-link"}
            aria-current={isActive(`/manage/${key}`) ? "page" : undefined}>
            {resource.title}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span className="badge badge-admin">Superadmin</span>
        <span className="sidebar-email" title={email}>{email}</span>
        <LogoutButton className="button button-sidebar" />
      </div>
    </aside>
  );
}

/* Right-column lists for the jurisdiction plate (jurisdiction-detail.md): 3 most recent per section,
   title (2-line clamp), meta row (mono date · type · status marker or significance), "All →" link. */
import type { ReactNode } from "react";
import { Link } from "@/taxatlas-ui/lib/navigation";
import { CountPill } from "./Marker";
import "./lists.css";

export interface SideItem {
  key: string | number;
  /** Plain string or a <Bilingual> node (original + English). */
  title: ReactNode;
  meta: ReactNode;
  onOpen?: () => void;
  href?: string;
}

export function SideSection({ title, count, allHref, allLabel = "All →", items, empty, children }: { title: string; count?: number; allHref?: string; allLabel?: string; items?: SideItem[]; empty?: string; children?: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2>
        {title}
        {count != null && <CountPill n={count} />}
        {allHref && <Link to={allHref} className="all">{allLabel}</Link>}
      </h2>
      {items && items.length === 0 && <div className="ta-empty">{empty ?? "None recorded."}</div>}
      {items?.map((it) =>
        it.href ? (
          <Link key={it.key} to={it.href} className="ta-item" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="t">{it.title}</div>
            <div className="m">{it.meta}</div>
          </Link>
        ) : (
          <button key={it.key} type="button" className="ta-item" onClick={it.onOpen}>
            <div className="t">{it.title}</div>
            <div className="m">{it.meta}</div>
          </button>
        ),
      )}
      {children}
    </section>
  );
}

/* Bilingual text (original + English) — the one way crawled text is rendered across the app.
 *
 *   <Bilingual original={r.title} lang={r.lang} translation={r.title_en} />
 *
 * - The original is rendered with `lang={lang}` and `dir="auto"`, so RTL scripts align right inside their own line while
 *   the English line below stays LTR.
 * - When `translation` is non-empty (and differs from the original) a second line follows in ink-2, prefixed by a small
 *   mono "EN" marker whose title explains the provenance (machine translation). Text, not a pill.
 * - `table` mode: each line is a one-line ellipsis with the full text in its `title`; the English line is one size step
 *   down (11.5 px). Rows grow to two/three lines; nothing is hidden.
 * - `showMissing` (drawers/detail only): when the language is known and not English but no translation exists yet, a
 *   muted "(no English translation yet)" follows the original. Tables never show it.
 * - Accessibility: the English line is a `<span lang="en">`, the marker is decorative (`aria-hidden`); screen readers
 *   read both languages, once each. No headings are created here — drop `BilingualTitle` inside the existing <h2>. */
import { Fragment, type ElementType, type ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { MACHINE_TRANSLATION_NOTE, NO_TRANSLATION_NOTE, isForeign, langBadge, langName, langTitle } from "@/taxatlas-ui/lib/i18n";
import "./bilingual.css";

export interface BilingualProps {
  /** Crawled text in its source language. Null/empty renders nothing (callers keep their own "—" fallback). */
  original: string | null | undefined;
  /** BCP-47 code of the original (`ar`, `pl`, `zh-Hant`). Null = not detected: rendered with dir="auto" only. */
  lang?: string | null;
  /** English translation; null/empty or identical to the original → single line. */
  translation?: string | null;
  /** Table cell: one-line ellipsis per line, English one size step down. */
  table?: boolean;
  /** Drawers/detail: show "(no English translation yet)" when lang is foreign and no translation exists. */
  showMissing?: boolean;
  /** Wrapper element. Defaults to span (block-level via CSS); use "p" inside prose. */
  as?: "span" | "div" | "p";
  className?: string;
  /** Extra class on the original line (e.g. `t` in table title cells so the existing cell styles apply). */
  originalClassName?: string;
  /** Extra class on the English line. */
  translationClassName?: string;
  /** Render both lines inline (`original · EN translation`) instead of stacked; used in tight meta rows. */
  inline?: boolean;
  /** Full text for the title attribute of the original line; defaults to the original itself in table mode. */
  title?: string;
}

function same(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** Does this record need (or have) an English line? Exposed so list cells can decide on an extra row height etc. */
export function hasTranslation(original: string | null | undefined, translation: string | null | undefined): boolean {
  return !!original && !!translation && translation.trim() !== "" && !same(original, translation);
}

export function Bilingual({ original, lang, translation, table, showMissing, as = "span", className, originalClassName, translationClassName, inline, title }: BilingualProps) {
  if (original == null || original === "") return null;
  const Tag: ElementType = as;
  const en = hasTranslation(original, translation) ? translation!.trim() : null;
  const missing = !en && showMissing && !table && isForeign(lang);
  return (
    <Tag className={cn("bi", table && "bi-table", inline && "bi-inline", className)} data-lang={lang || undefined}>
      <span className={cn("bi-orig", originalClassName)} lang={lang || undefined} dir="auto" title={title ?? (table ? original : undefined)}>
        {original}
      </span>
      {en && <EnLine text={en} table={table} className={translationClassName} />}
      {missing && <span className="bi-missing">{NO_TRANSLATION_NOTE}</span>}
    </Tag>
  );
}

/** The English line on its own, for compositions where the original is wrapped in a link or other markup. */
export function EnLine({ text, table, className }: { text: string | null | undefined; table?: boolean; className?: string }) {
  if (!text || text.trim() === "") return null;
  return (
    <span className={cn("bi-en", table && "bi-table-line", className)} lang="en" title={table ? text : undefined}>
      <EnMark />
      {text}
    </span>
  );
}

/** The small mono "EN" marker. Decorative for AT (the lang="en" span already announces the switch). */
export function EnMark() {
  return (
    <span className="bi-mark" aria-hidden="true" title={MACHINE_TRANSLATION_NOTE}>
      EN
    </span>
  );
}

/** Drawer-head title: original (lang/dir) + English line at the same size, weight 400. Render inside the existing <h2>. */
export function BilingualTitle({ original, lang, translation, className }: Pick<BilingualProps, "original" | "lang" | "translation" | "className">) {
  return <Bilingual original={original} lang={lang} translation={translation} showMissing className={cn("bi-title", className)} />;
}

/** Prose block for drawer summaries/holdings/notes: original paragraph then the English paragraph. */
export function BilingualProse({ original, lang, translation, className, originalClassName }: Pick<BilingualProps, "original" | "lang" | "translation" | "className" | "originalClassName">) {
  if (!original) return null;
  const en = hasTranslation(original, translation) ? translation!.trim() : null;
  const missing = !en && isForeign(lang);
  return (
    <div className={cn("bi bi-prose", className)} data-lang={lang || undefined}>
      <p className={cn("bi-orig", originalClassName)} lang={lang || undefined} dir="auto">
        {original}
      </p>
      {en && (
        <p className="bi-en" lang="en">
          <EnMark />
          {en}
        </p>
      )}
      {missing && <p className="bi-missing">{NO_TRANSLATION_NOTE}</p>}
    </div>
  );
}

/** Mono language tag for the list tables' Lang column (`AR`, `PL`); nothing for English or unknown. */
export function LangTag({ lang, className }: { lang: string | null | undefined; className?: string }) {
  const badge = langBadge(lang);
  if (!badge) return null;
  return (
    <span className={cn("bi-lang", className)} title={langTitle(lang)} aria-label={`Original language: ${langName(lang)}`}>
      {badge}
    </span>
  );
}

/** Meta lines joined with " · " (authority · reference, court · citation): isolate each segment with <bdi> so an RTL
 *  segment does not drag the neighbouring date or reference into its direction ("2026-08-25" → "25-08-2026"). */
export function BidiSegments({ text, sep = " · ", lang }: { text: string; sep?: string; lang?: string | null }) {
  const parts = text.split(sep);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          <bdi lang={lang || undefined}>{p}</bdi>
        </Fragment>
      ))}
    </>
  );
}

/** Convenience for list cells: title + sub line, both bilingual. Keeps the `.t` / `.sub` classes the tables style. */
export function BilingualCell({ title, titleEn, lang, sub, subEn, subTitle }: { title: string; titleEn?: string | null; lang?: string | null; sub?: ReactNode; subEn?: string | null; subTitle?: string }) {
  return (
    <>
      <Bilingual original={title} lang={lang} translation={titleEn} table originalClassName="t" />
      {sub && (
        <span className="sub bi-sub" title={subTitle}>
          {typeof sub === "string" ? <BidiSegments text={sub} lang={lang} /> : sub}
        </span>
      )}
      {subEn && <EnLine text={subEn} table className="sub bi-sub" />}
    </>
  );
}

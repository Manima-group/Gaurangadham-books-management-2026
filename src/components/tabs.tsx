import Link from "next/link";

/** Clearly labelled tabs that are plain links, so each tab has its own address and Back works. */
export function TabLinks({ items, label }: { items: { href: string; label: string; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200/70 bg-stone-100/70 p-1 [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition ${
            t.active ? "bg-white text-brand-700 shadow-card" : "text-ink-600 hover:bg-white/60"
          }`}
        >
          {t.label}
          {t.count != null && <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-xs tabular-nums text-ink-700">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Previous / next page links that keep every other filter in the address. */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="btn-secondary btn-sm">← Previous</Link> : <span />}
      <span className="text-ink-500">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="btn-secondary btn-sm">Next →</Link> : <span />}
    </nav>
  );
}

/** Builds "path?a=1&b=2" from a base and a set of values, dropping empty ones. */
export function withQuery(path: string, values: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

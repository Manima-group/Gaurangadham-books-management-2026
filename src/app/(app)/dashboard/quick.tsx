import Link from "next/link";
import type { ReactNode } from "react";

type QA = { href: string; label: string; icon: string; desc?: string; badge?: number };

/** Big, clear action buttons. `primary` = the few main ones at the top of a dashboard. */
export function QuickActions({ items, title = "Quick Actions", primary, bare }: { items: QA[]; title?: string; primary?: boolean; bare?: boolean }) {
  const grid = (
    <div className={`grid gap-2.5 ${primary ? "grid-cols-2" : "grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3"}`}>
      {items.map((it) => (
        <Link
          key={it.href + it.label}
          href={it.href}
          className={`group relative flex items-center gap-3 rounded-2xl border bg-white p-3 transition duration-150 hover:border-brand-300 hover:shadow-lift focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
            primary ? "min-h-[4.25rem] border-stone-200/80 shadow-card sm:p-4" : "min-h-14 border-stone-200/80"
          }`}
        >
          <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100 ${primary ? "h-10 w-10 text-xl" : "h-9 w-9 text-lg"}`}>{it.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold leading-snug text-ink-900 group-hover:text-brand-700">{it.label}</span>
            {it.desc && <span className="block text-xs text-ink-500">{it.desc}</span>}
          </span>
          {!!it.badge && <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{it.badge}</span>}
        </Link>
      ))}
    </div>
  );
  if (bare) return grid;
  return (
    <section aria-label={title} className="mb-6">
      <h2 className="mb-2.5 font-display text-base font-bold text-ink-900">{title}</h2>
      {grid}
    </section>
  );
}

export type Todo = { href: string; icon: string; text: ReactNode; tone?: "red" | "amber" | "green"; action?: string };

/** "To do now": the few things that need this person today, each one tap away. */
export function TodoNow({ items, done = "Nothing waiting. All caught up 🙏" }: { items: Todo[]; done?: string }) {
  return (
    <section aria-label="To do now" className="mb-6 rounded-2xl border border-stone-200/80 bg-white shadow-card">
      <h2 className="flex items-center gap-2 px-4 pb-1 pt-3.5 font-display text-base font-bold text-ink-900 sm:px-5">
        To do now
        {items.length > 0 && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">{items.length}</span>}
      </h2>
      {items.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-sm text-ink-500 sm:px-5">✅ {done}</p>
      ) : (
        <ul className="divide-y divide-stone-100 pb-1">
          {items.map((t, i) => (
            <li key={i}>
              <Link href={t.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-stone-50 sm:px-5">
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${
                    t.tone === "red" ? "bg-red-50" : t.tone === "green" ? "bg-emerald-50" : "bg-amber-50"
                  }`}
                >
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink-800">{t.text}</span>
                <span className="shrink-0 text-sm font-semibold text-brand-700">{t.action ?? "Open"} ›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

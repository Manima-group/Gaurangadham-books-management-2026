import Link from "next/link";

export function QuickActions({ items }: { items: { href: string; label: string; icon: string; desc?: string; badge?: number }[] }) {
  return (
    <section aria-labelledby="qa" className="mb-6">
      <h2 id="qa" className="mb-3 font-display text-lg font-bold text-ink-900">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((it) => (
          <Link
            key={it.href + it.label}
            href={it.href}
            className="group relative flex min-h-28 flex-col justify-between rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-2xl ring-1 ring-brand-200/60 transition group-hover:scale-105" aria-hidden>{it.icon}</span>
            <span className="mt-3 font-semibold leading-snug text-ink-900 group-hover:text-brand-700">{it.label} <span aria-hidden className="inline-block transition group-hover:translate-x-0.5">→</span></span>
            {it.desc && <span className="mt-0.5 text-xs text-ink-500">{it.desc}</span>}
            {!!it.badge && (
              <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{it.badge}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

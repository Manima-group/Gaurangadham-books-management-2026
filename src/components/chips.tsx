import Link from "next/link";

/** Row of one-tap filter chips (links). Scrolls sideways on small phones. */
export function ChipLinks({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label={label}>
      {items.map((it) => (
        <Link
          key={it.href + it.label}
          href={it.href}
          aria-current={it.active ? "true" : undefined}
          className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition ${
            it.active
              ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_6px_14px_-8px_rgb(217_85_18/0.9)]"
              : "border border-stone-300 bg-white text-ink-700 hover:bg-stone-50"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

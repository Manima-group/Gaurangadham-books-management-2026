import type { DevoteeBook } from "@/lib/devotee";
import { inr, num } from "@/lib/format";
import { BookCover } from "./ui";

/** Three big numbers: books given, sold, left. */
export function BookTotals({ books }: { books: DevoteeBook[] }) {
  const given = books.reduce((a, b) => a + b.given - b.returned, 0);
  const sold = books.reduce((a, b) => a + b.sold + b.pendingSold, 0);
  const left = books.reduce((a, b) => a + Math.max(b.available, 0), 0);
  const tile = (label: string, value: number, cls: string) => (
    <div className={`rounded-2xl p-3 text-center ${cls}`}>
      <p className="font-display text-3xl font-extrabold tabular-nums">{num(value)}</p>
      <p className="text-xs font-semibold opacity-80">{label}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      {tile("Given to me", given, "bg-white text-ink-900 ring-1 ring-stone-200")}
      {tile("Sold", sold, "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200")}
      {tile("Left", left, "bg-brand-50 text-brand-800 ring-1 ring-brand-200")}
    </div>
  );
}

/** Book-by-book: given, sold, left and the money from what was sold. */
export function BookList({ books, limit }: { books: DevoteeBook[]; limit?: number }) {
  const list = limit ? books.slice(0, limit) : books;
  const totAmt = books.reduce((a, b) => a + b.soldAmount, 0);
  return (
    <ul className="divide-y divide-stone-100">
      {list.map((b) => {
        const sold = b.sold + b.pendingSold;
        const pct = b.given ? Math.min(100, Math.round((sold / b.given) * 100)) : 0;
        return (
          <li key={b.id} className="py-3">
            <div className="flex items-center gap-3">
              <BookCover title={b.title} url={b.coverUrl} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-snug">{b.title}</p>
                <p className="text-xs text-ink-500">
                  {b.language} · {inr(b.pricePaise)} · {b.size === "big" ? "📕 Big" : "📗 Small"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-extrabold tabular-nums text-brand-700">{num(Math.max(b.available, 0))}</p>
                <p className="text-[11px] text-ink-500">left</p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-ink-700">
              <span>
                Given <b>{num(b.given)}</b> · Sold <b>{num(sold)}</b>
                {b.pendingSold ? <span className="text-sky-700"> ({b.pendingSold} in review)</span> : null}
                {b.returned + b.damaged ? <> · Returned/damaged <b>{num(b.returned + b.damaged)}</b></> : null}
              </span>
              <span className="font-semibold text-ink-900">{inr(b.soldAmount)}</span>
            </p>
          </li>
        );
      })}
      {!limit && books.length > 1 && (
        <li className="flex justify-between pt-3 text-sm font-bold">
          <span>Total sales value</span>
          <span>{inr(totAmt)}</span>
        </li>
      )}
    </ul>
  );
}

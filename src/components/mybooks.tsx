import Link from "next/link";
import type { DevoteeBook } from "@/lib/devotee";
import { inr, num } from "@/lib/format";
import { BookCover } from "./ui";

export type TotalKey = "given" | "sold" | "left";
const qtyOf: Record<TotalKey, (b: DevoteeBook) => number> = {
  given: (b) => b.given - b.returned,
  sold: (b) => b.sold + b.pendingSold,
  left: (b) => Math.max(b.available, 0),
};

/** Three big numbers: books given, sold, left. Each tile opens the book-by-book list for that number. */
export function BookTotals({ books, active }: { books: DevoteeBook[]; active?: TotalKey }) {
  const sum = (k: TotalKey) => books.reduce((a, b) => a + qtyOf[k](b), 0);
  const tile = (k: TotalKey, label: string, cls: string) => (
    <Link
      href={active === k ? "/my/books" : `/my/books?show=${k}#detail`}
      scroll={false}
      aria-current={active === k ? "true" : undefined}
      className={`block rounded-2xl p-3 text-center transition hover:-translate-y-0.5 hover:shadow-card ${cls} ${active === k ? "ring-2 ring-brand-500" : ""}`}
      data-testid={`total-${k}`}
    >
      <p className="font-display text-3xl font-extrabold tabular-nums">{num(sum(k))}</p>
      <p className="text-xs font-semibold opacity-80">{label} ›</p>
    </Link>
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      {tile("given", "Given to me", "bg-white text-ink-900 ring-1 ring-stone-200")}
      {tile("sold", "Sold", "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200")}
      {tile("left", "Left", "bg-brand-50 text-brand-800 ring-1 ring-brand-200")}
    </div>
  );
}

/** Book name and quantity for one of the three totals. */
export function TotalDetail({ books, show }: { books: DevoteeBook[]; show: TotalKey }) {
  const title = { given: "Books given to me", sold: "Books I sold", left: "Books left with me" }[show];
  const rows = books.map((b) => ({ b, q: qtyOf[show](b) })).filter((r) => r.q > 0).sort((a, z) => z.q - a.q);
  return (
    <section id="detail" className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-stone-200/70" data-testid="total-detail">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
        <Link href="/my/books" scroll={false} className="text-sm font-semibold text-brand-700">Close ✕</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500">None.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map(({ b, q }) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <span><span className="font-semibold text-ink-900">{b.title}</span> <span className="text-sm text-ink-500">· {b.language}</span></span>
              <span className="font-display text-lg font-bold tabular-nums">{num(q)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between py-2 text-sm font-semibold text-ink-700">
            <span>Total</span><span className="tabular-nums">{num(rows.reduce((a, r) => a + r.q, 0))}</span>
          </li>
        </ul>
      )}
    </section>
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

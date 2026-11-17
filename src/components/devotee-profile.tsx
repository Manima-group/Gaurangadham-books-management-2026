import Link from "next/link";
import { devoteeBooks } from "@/lib/devotee";
import {
  dateRange, devoteeAmounts, devoteeHistory, devoteePlaces, devoteeSales,
  HISTORY_KINDS, PRESET_LABEL, SALE_STATUSES, type Preset,
} from "@/lib/hierarchy";
import { fmtDate, fmtDateTime, inr, num } from "@/lib/format";
import { MOVEMENT_LABEL, REPORT_STATUS } from "@/lib/terms";
import { Badge, Card, EmptyState, PageHeader, ReportStatus, StatCard } from "./ui";
import { ChipLinks } from "./chips";
import { Pager, TabLinks, withQuery } from "./tabs";

export type ProfileSP = {
  tab?: string; preset?: string; from?: string; to?: string; book?: string; place?: string; status?: string; kind?: string; page?: string; ret?: string;
};

const SLOT: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

/**
 * Level 3 — one devotee's books, sales and full history. Shared by Chakra Sevak, Sector Sevak
 * and the devotee's own view; the page that renders it has already checked access.
 */
export async function DevoteeProfile({
  devotee, base, crumbs, title, sp, canOpenReports, backHref,
}: {
  devotee: { id: string; name: string; phone: string | null };
  base: string;
  crumbs: { label: string; href?: string }[];
  title?: string;
  sp: ProfileSP;
  canOpenReports: boolean;
  backHref?: string;
}) {
  const tab = sp.tab === "sales" || sp.tab === "history" ? sp.tab : "books";
  const [books, amounts] = await Promise.all([devoteeBooks(devotee.id), devoteeAmounts(devotee.id)]);
  const tot = books.reduce(
    (a, b) => ({ given: a.given + b.given, sold: a.sold + b.sold, returned: a.returned + b.returned, damaged: a.damaged + b.damaged, left: a.left + b.holding }),
    { given: 0, sold: 0, returned: 0, damaged: 0, left: 0 },
  );
  const keep = { ret: sp.ret };

  return (
    <>
      <PageHeader
        title={title ?? devotee.name}
        crumbs={crumbs}
        doHere="Books shows what this devotee holds now. Sales and History can be filtered by date, book and more."
        actions={backHref ? <Link href={backHref} className="btn-secondary btn-sm">← Back to devotees</Link> : undefined}
      />
      {devotee.phone && <p className="-mt-4 mb-4 text-sm text-ink-500">📞 <a href={`tel:${devotee.phone}`} className="hover:underline">{devotee.phone}</a></p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Books received" value={num(tot.given)} href={`${withQuery(base, keep)}#books`} />
        <StatCard label="Sold (approved)" value={num(tot.sold)} tone="green" href={withQuery(base, { ...keep, tab: "sales" })} hint={amounts.pendingQty ? `+${num(amounts.pendingQty)} waiting approval` : undefined} />
        <StatCard label="Returned" value={num(tot.returned)} href={withQuery(base, { ...keep, tab: "history" })} hint={tot.damaged ? `${num(tot.damaged)} damaged / lost` : undefined} />
        <StatCard label="Remaining with devotee" value={num(tot.left)} tone="purple" href={`${withQuery(base, keep)}#books`} />
        <StatCard label="Sales amount (approved)" value={inr(amounts.approved)} tone="blue" href={withQuery(base, { ...keep, tab: "sales" })} hint={amounts.pending ? `+${inr(amounts.pending)} waiting` : undefined} />
      </div>

      <TabLinks
        label="Devotee sections"
        items={[
          { href: withQuery(base, { ...keep }), label: "📚 Books", active: tab === "books" },
          { href: withQuery(base, { ...keep, tab: "sales" }), label: "🛍️ Sales", active: tab === "sales" },
          { href: withQuery(base, { ...keep, tab: "history" }), label: "🕘 History", active: tab === "history" },
        ]}
      />

      {tab === "books" && <BooksTab books={books} amounts={amounts.byBook} />}
      {tab === "sales" && <SalesTab devoteeId={devotee.id} base={base} sp={sp} books={books} canOpenReports={canOpenReports} />}
      {tab === "history" && <HistoryTab devoteeId={devotee.id} base={base} sp={sp} books={books} canOpenReports={canOpenReports} />}
    </>
  );
}

type Books = Awaited<ReturnType<typeof devoteeBooks>>;

function BooksTab({ books, amounts }: { books: Books; amounts: Map<number, { approved: number; pending: number; pendingQty: number }> }) {
  if (books.length === 0)
    return <Card><EmptyState icon="📚" title="No books given to this devotee yet.">Books appear here once the Dham gives them some.</EmptyState></Card>;
  const hasTransfers = books.some((b) => b.transferIn || b.transferOut);
  return (
    <Card id="books" title="Book Inventory" subtitle="Remaining = received + by transfer − transferred out − sold − returned − damaged. Current stock, not affected by any date filter.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="text-left text-xs text-ink-500">
            <tr className="border-b border-stone-200">
              <th className="py-2 pr-3">Book</th>
              <th className="px-2 text-right">Received</th>
              {hasTransfers && <th className="px-2 text-right">Given to Devotee — Transfer</th>}
              <th className="px-2 text-right">Sold</th>
              <th className="px-2 text-right">Returned</th>
              <th className="px-2 text-right">Remaining</th>
              <th className="pl-2 text-right">Sales amount</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b) => {
              const a = amounts.get(b.id);
              return (
                <tr key={b.id} className="border-b border-stone-100" data-testid="book-row">
                  <td className="py-2.5 pr-3 font-medium">{b.title} <span className="text-ink-500">({b.language})</span></td>
                  <td className="px-2 text-right tabular-nums">{num(b.given)}</td>
                  {hasTransfers && <td className="px-2 text-right tabular-nums">{b.transferIn ? `+${num(b.transferIn)}` : "—"}{b.transferOut ? <span className="block text-[11px] text-ink-500">−{num(b.transferOut)} sent out</span> : null}</td>}
                  <td className="px-2 text-right tabular-nums">{num(b.sold)}{b.pendingSold ? <span className="block text-[11px] text-amber-700">+{num(b.pendingSold)} waiting</span> : null}</td>
                  <td className="px-2 text-right tabular-nums">{num(b.returned)}{b.damaged ? <span className="block text-[11px] text-ink-500">{num(b.damaged)} damaged</span> : null}</td>
                  <td className="px-2 text-right font-bold tabular-nums text-brand-700">{num(b.holding)}</td>
                  <td className="pl-2 text-right tabular-nums">{inr(a?.approved ?? 0)}{a?.pending ? <span className="block text-[11px] text-amber-700">+{inr(a.pending)} waiting</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Date presets + custom range + extra selects. Everything is in the address, so Back keeps it. */
function Filters({ base, sp, tab, children }: { base: string; sp: ProfileSP; tab: string; children?: React.ReactNode }) {
  const r = dateRange(sp);
  const others = { tab, ret: sp.ret, book: sp.book, place: sp.place, status: sp.status, kind: sp.kind };
  return (
    <div className="mb-4 space-y-3">
      <ChipLinks
        label="Date"
        items={(Object.keys(PRESET_LABEL) as Exclude<Preset, "custom">[]).map((p) => ({
          href: withQuery(base, { ...others, preset: p === "all" ? undefined : p }),
          label: PRESET_LABEL[p],
          active: r.preset === p,
        }))}
      />
      <form action={base} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_auto]">
        <input type="hidden" name="tab" value={tab} />
        {sp.ret && <input type="hidden" name="ret" value={sp.ret} />}
        <input type="hidden" name="preset" value="custom" />
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">From date
          <input type="date" name="from" defaultValue={r.from} className="field-input py-2.5 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">To date
          <input type="date" name="to" defaultValue={r.to} className="field-input py-2.5 text-sm font-normal" />
        </label>
        {children}
        <div className="flex items-end gap-2">
          <button className="btn-primary btn-sm flex-1">Apply</button>
          <Link href={withQuery(base, { tab, ret: sp.ret })} className="btn-secondary btn-sm">Clear</Link>
        </div>
      </form>
      <p className="text-xs text-ink-500">{r.from || r.to ? `Showing ${r.from ? fmtDate(r.from) : "the start"} → ${r.to ? fmtDate(r.to) : "today"} (India time)` : "Showing all dates"}</p>
    </div>
  );
}

function BookSelect({ books, value }: { books: Books; value?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">Book
      <select name="book" defaultValue={value ?? ""} className="field-input py-2.5 text-sm font-normal">
        <option value="">All books</option>
        {books.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.language})</option>)}
      </select>
    </label>
  );
}

async function SalesTab({ devoteeId, base, sp, books, canOpenReports }: { devoteeId: string; base: string; sp: ProfileSP; books: Books; canOpenReports: boolean }) {
  const r = dateRange(sp);
  const [res, places] = await Promise.all([
    devoteeSales(devoteeId, { from: r.from, to: r.to, book: Number(sp.book) || undefined, place: sp.place, status: sp.status, page: Number(sp.page) || 1 }),
    devoteePlaces(devoteeId),
  ]);
  const pageHref = (p: number) => withQuery(base, { tab: "sales", ret: sp.ret, preset: sp.preset, from: sp.from, to: sp.to, book: sp.book, place: sp.place, status: sp.status, page: p > 1 ? p : undefined });

  return (
    <Card title="Sales Details" subtitle="Every book sold, with the price, place and date the devotee reported.">
      <Filters base={base} sp={sp} tab="sales">
        <BookSelect books={books} value={sp.book} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">Place
            <select name="place" defaultValue={sp.place ?? ""} className="field-input py-2.5 text-sm font-normal">
              <option value="">All places</option>
              {places.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="__none">Not recorded</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">Status
            <select name="status" defaultValue={sp.status ?? ""} className="field-input py-2.5 text-sm font-normal">
              <option value="">All sent</option>
              {SALE_STATUSES.map((s) => <option key={s} value={s}>{REPORT_STATUS[s]?.label ?? s}</option>)}
            </select>
          </label>
        </div>
      </Filters>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-stone-50 p-2"><p className="text-[11px] text-ink-500">Books in range</p><p className="font-display text-xl font-extrabold tabular-nums" data-testid="sales-qty">{num(res.qty)}</p></div>
        <div className="rounded-xl bg-emerald-50 p-2"><p className="text-[11px] text-ink-500">Approved amount</p><p className="font-display text-xl font-extrabold tabular-nums">{inr(res.approvedAmount)}</p></div>
        <div className="rounded-xl bg-amber-50 p-2"><p className="text-[11px] text-ink-500">Waiting approval</p><p className="font-display text-xl font-extrabold tabular-nums">{inr(res.pendingAmount)}</p></div>
      </div>
      <p className="mb-2 text-[11px] text-ink-500">These are sales in the chosen dates only — the Books tab shows what the devotee holds now.</p>

      {res.rows.length === 0 ? (
        <EmptyState icon="🛍️" title="No sales for these filters.">Try a wider date range or clear the filters.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr className="border-b border-stone-200">
                <th className="py-2 pr-3">Date</th>
                <th className="px-2">Book</th>
                <th className="px-2 text-right">Qty</th>
                <th className="px-2 text-right">Unit price</th>
                <th className="px-2 text-right">Amount</th>
                <th className="px-2">Sold at</th>
                <th className="px-2">Status</th>
                <th className="pl-2">Reference</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((x) => (
                <tr key={x.id} className="border-b border-stone-100" data-testid="sale-row">
                  <td className="whitespace-nowrap py-2.5 pr-3">{fmtDate(x.date)}</td>
                  <td className="px-2 font-medium">{x.book}</td>
                  <td className="px-2 text-right tabular-nums">{num(x.qty)}</td>
                  <td className="px-2 text-right tabular-nums">{x.price ? inr(x.price) : "Not recorded"}</td>
                  <td className="px-2 text-right font-semibold tabular-nums">{inr(x.amount)}</td>
                  <td className="px-2">
                    {x.place ? <>{x.place}{(x.area || x.slot) && <span className="block text-[11px] text-ink-500">{[x.area, x.slot && SLOT[x.slot]].filter(Boolean).join(" · ")}</span>}</> : <span className="text-ink-500">Not recorded</span>}
                  </td>
                  <td className="px-2"><ReportStatus status={x.status} /></td>
                  <td className="whitespace-nowrap pl-2">
                    {canOpenReports ? <Link href={`/reports/${x.reportId}`} className="text-brand-700 hover:underline">Report #{x.reportId}</Link> : <span className="text-ink-600">Report #{x.reportId}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={res.page} pages={res.pages} href={pageHref} />
    </Card>
  );
}

async function HistoryTab({ devoteeId, base, sp, books, canOpenReports }: { devoteeId: string; base: string; sp: ProfileSP; books: Books; canOpenReports: boolean }) {
  const r = dateRange(sp);
  const res = await devoteeHistory(devoteeId, { from: r.from, to: r.to, book: Number(sp.book) || undefined, kind: sp.kind, status: sp.status, page: Number(sp.page) || 1 });
  const pageHref = (p: number) => withQuery(base, { tab: "history", ret: sp.ret, preset: sp.preset, from: sp.from, to: sp.to, book: sp.book, kind: sp.kind, status: sp.status, page: p > 1 ? p : undefined });
  const sign = (x: (typeof res.rows)[number]) => (x.toDevotee ? "+" : "−");

  return (
    <Card title="Complete History" subtitle="Every book given, sold, returned or corrected — from the stock ledger.">
      <Filters base={base} sp={sp} tab="history">
        <BookSelect books={books} value={sp.book} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">Type
            <select name="kind" defaultValue={sp.kind ?? ""} className="field-input py-2.5 text-sm font-normal">
              <option value="">All types</option>
              {HISTORY_KINDS.map((k) => <option key={k} value={k}>{MOVEMENT_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">Status
            <select name="status" defaultValue={sp.status ?? ""} className="field-input py-2.5 text-sm font-normal">
              <option value="">All</option>
              <option value="active">Counted</option>
              <option value="undone">Undone / corrections</option>
            </select>
          </label>
        </div>
      </Filters>

      {res.rows.length === 0 ? (
        <EmptyState icon="🕘" title="Nothing in this period.">Try a wider date range or clear the filters.</EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {res.rows.map((x) => (
            <li key={x.id} className="flex items-start gap-3 py-3" data-testid="history-row">
              <span className={`mt-0.5 w-12 shrink-0 text-right font-display text-lg font-extrabold tabular-nums ${x.toDevotee ? "text-emerald-700" : "text-ink-700"} ${x.undone ? "line-through opacity-50" : ""}`}>
                {sign(x)}{num(x.qty)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {MOVEMENT_LABEL[x.kind] ?? x.kind} · <span className="font-normal">{x.book}</span>{" "}
                  {x.undone ? <Badge tone="gray">Undone</Badge> : x.kind === "correction" ? <Badge tone="amber">Correction</Badge> : <Badge tone="green">Counted</Badge>}
                </p>
                <p className="text-xs text-ink-500">
                  {fmtDate(x.date)} · recorded {fmtDateTime(x.at)} by {x.by}
                  {x.reportId != null && <> · {canOpenReports ? <Link href={`/reports/${x.reportId}`} className="text-brand-700 hover:underline">Report #{x.reportId}</Link> : `Report #${x.reportId}`}</>}
                  {x.reference && <> · Ref {x.reference}</>}
                </p>
                {x.note && <p className="mt-0.5 text-xs text-ink-600">📝 {x.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={res.page} pages={res.pages} href={pageHref} />
    </Card>
  );
}

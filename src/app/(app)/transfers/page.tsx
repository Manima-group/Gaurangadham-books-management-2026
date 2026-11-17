import Link from "next/link";
import { db, schema } from "@/db";
import { requireUser, type AppUser } from "@/lib/session";
import { fromHolderOf, holderNames, IN_TRANSIT, listTransfers, needsMe, OPEN, ref, remainingOf, approvedOf, toHolderOf, type Transfer } from "@/lib/transfers";
import { fmtDateTime, num } from "@/lib/format";
import { TRANSFER_STATUS } from "@/lib/terms";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { TabLinks, withQuery } from "@/components/tabs";

type SP = { tab?: string; status?: string; book?: string; q?: string };
const TABS = ["overview", "incoming", "outgoing", "transit", "history"] as const;

/** Is this transfer coming to me (I give the books) or going out from me (I asked)? */
function side(u: AppUser, t: Transfer) {
  if (u.role === "manager") return { give: t.fromDhamId === u.dhamId, ask: t.toDhamId === u.dhamId };
  if (u.role === "devotee") return { give: fromHolderOf(t) === `devotee:${u.id}` || t.senderId === u.id, ask: toHolderOf(t) === `devotee:${u.id}` || t.requestedBy === u.id };
  return { give: true, ask: true };
}

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("admin", "manager", "devotee");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "overview";
  const { rows: all, lines } = await listTransfers(u);
  const books = await db.select({ id: schema.book.id, title: schema.book.title, language: schema.book.language }).from(schema.book);
  const bt = (id: number) => books.find((b) => b.id === id)?.title ?? "Book";
  const name = await holderNames(all.flatMap((t) => [fromHolderOf(t), toHolderOf(t)]));
  const linesOf = (id: number) => lines.filter((l) => l.transferId === id);
  const isOpen = (t: Transfer) => (OPEN as readonly string[]).includes(t.status);
  const inTransit = (t: Transfer) => (IN_TRANSIT as readonly string[]).includes(t.status);
  const mine = all.filter((t) => needsMe(u, t));

  const q = (sp.q ?? "").trim().toLowerCase();
  let rows = all;
  if (tab === "overview") rows = mine.length ? mine : all.filter(isOpen).slice(0, 10);
  if (tab === "incoming") rows = all.filter((t) => side(u, t).give);
  if (tab === "outgoing") rows = all.filter((t) => side(u, t).ask);
  if (tab === "transit") rows = all.filter(inTransit);
  if (tab !== "overview") {
    if (sp.status && TRANSFER_STATUS[sp.status]) rows = rows.filter((t) => t.status === sp.status || (sp.status === "completed" && t.status === "received"));
    if (sp.book) rows = rows.filter((t) => linesOf(t.id).some((l) => l.bookId === Number(sp.book)));
    if (q) rows = rows.filter((t) => `${ref(t.id)} ${name(fromHolderOf(t))} ${name(toHolderOf(t))}`.toLowerCase().includes(q));
  }
  const inTransitQty = all.filter(inTransit).reduce((a, t) => a + linesOf(t.id).reduce((b, l) => b + remainingOf(t, l), 0), 0);
  const base = "/transfers";
  const canRequest = u.role !== "devotee" || u.canSeeAvailability;

  return (
    <>
      <PageHeader
        title="Books Transfer"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Books Transfer" }]}
        doHere="Move books between Dhams and devotees. Whoever needs books asks → the source Dham's Sector Sevak approves (copies are reserved) → the sender accepts and sends → the receiver confirms what arrived."
        next="Stock changes only when books are sent and when they are received. A transfer is not a sale: sales and money totals do not change."
        actions={
          <>
            {canRequest && <Link href="/transfers/new" className="btn-primary btn-sm">➕ Request Books</Link>}
            {u.role !== "devotee" && <Link href="/transfers/report" className="btn-secondary btn-sm">📊 Transfer Reports</Link>}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="⏳" label="Waiting for you" value={num(mine.length)} tone={mine.length ? "amber" : "gray"} href={withQuery(base, { tab: "overview" })} hint="Approve, send or receive" />
        <StatCard icon="📨" label="Open requests" value={num(all.filter((t) => ["requested", "approved", "accepted"].includes(t.status)).length)} tone="blue" href={withQuery(base, { tab: "history", status: "requested" })} />
        <StatCard icon="🚚" label="Copies on the way" value={num(inTransitQty)} tone="amber" href={withQuery(base, { tab: "transit" })} hint={`${all.filter(inTransit).length} transfers`} />
        <StatCard icon="⚠️" label="Disputed / partly received" value={num(all.filter((t) => t.status === "disputed" || t.status === "partially_received").length)} tone="red" href={withQuery(base, { tab: "history", status: "disputed" })} />
      </div>

      <TabLinks
        label="Books Transfer sections"
        items={[
          { label: "Overview", href: withQuery(base, {}), active: tab === "overview" },
          { label: u.role === "admin" ? "All giving" : "Incoming requests", href: withQuery(base, { tab: "incoming" }), active: tab === "incoming" },
          { label: u.role === "admin" ? "All asking" : "Outgoing requests", href: withQuery(base, { tab: "outgoing" }), active: tab === "outgoing" },
          { label: "In transit", href: withQuery(base, { tab: "transit" }), active: tab === "transit" },
          { label: "History", href: withQuery(base, { tab: "history" }), active: tab === "history" },
        ]}
      />

      {tab !== "overview" && (
        <form action={base} className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <input type="hidden" name="tab" value={tab} />
          <label className="col-span-2 text-xs font-semibold text-ink-600 sm:w-56">
            Reference or name
            <input name="q" defaultValue={sp.q ?? ""} placeholder="BT-00012, Dham, devotee" className="field-input mt-1" />
          </label>
          <label className="text-xs font-semibold text-ink-600 sm:w-48">
            Book
            <select name="book" defaultValue={sp.book ?? ""} className="field-input mt-1">
              <option value="">All books</option>
              {books.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.language})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-600 sm:w-44">
            Status
            <select name="status" defaultValue={sp.status ?? ""} className="field-input mt-1">
              <option value="">Any status</option>
              {Object.entries(TRANSFER_STATUS).filter(([k]) => k !== "received").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <button className="btn-primary btn-sm">Show</button>
          {(sp.q || sp.book || sp.status) && <Link href={withQuery(base, { tab })} className="btn-secondary btn-sm">Clear</Link>}
        </form>
      )}

      {tab === "overview" && <h2 className="mb-2 font-display text-base font-bold text-ink-900">{mine.length ? "Waiting for you" : "Open transfers"}</h2>}
      {rows.length === 0 ? (
        <EmptyState icon="🚚" title={tab === "overview" ? "Nothing is waiting for you." : "No transfers here."}>
          {canRequest ? "Need books someone else has? Tap “Request Books”." : "Transfers you are part of appear here."}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5" data-testid="transfer-list">
          {rows.map((t) => {
            const st = TRANSFER_STATUS[t.status] ?? TRANSFER_STATUS.requested;
            const ls = linesOf(t.id);
            const asked = ls.reduce((a, l) => a + l.requestedQty, 0);
            const appr = ls.reduce((a, l) => a + approvedOf(l), 0);
            const left = ls.reduce((a, l) => a + remainingOf(t, l), 0);
            return (
              <li key={t.id}>
                <Link href={`/transfers/${t.id}`} className={`block rounded-2xl border bg-white p-4 shadow-card transition hover:border-brand-300 ${needsMe(u, t) ? "border-amber-300" : "border-stone-200/80"}`} data-testid="transfer-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink-900"><span className="text-ink-500">{ref(t.id)}</span> · {name(fromHolderOf(t))} → {name(toHolderOf(t))}</p>
                    <span className="flex flex-wrap gap-1.5">
                      {needsMe(u, t) && <Badge tone="amber">Your turn</Badge>}
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">
                    {num(asked)} asked{t.status !== "requested" && !["declined", "cancelled"].includes(t.status) ? ` · ${num(appr)} approved` : ""}{left ? ` · ${num(left)} on the way` : ""} — {ls.map((l) => bt(l.bookId)).join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">Asked {fmtDateTime(t.requestedAt)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

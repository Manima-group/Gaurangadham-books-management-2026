import { DownloadReport } from "@/components/download";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { H, devoteeStocksForDham, holderStock, scopeStock, total } from "@/lib/stock";
import { allBooks, allDhams, devoteesOf } from "@/lib/lookups";
import { inr, num } from "@/lib/format";
import { BookCover, Card, EmptyState, HelpTip, LinkButton, PageHeader, StatCard } from "@/components/ui";

export default async function StockPage() {
  const u = await requireUser("admin", "manager");
  const books = await allBooks();
  if (u.role === "admin") return <AdminStock books={books} />;
  const dhamId = u.dhamId!;
  const [store, scope, devStocks, devotees] = await Promise.all([
    holderStock(H.dham(dhamId)),
    scopeStock(dhamId),
    devoteeStocksForDham(dhamId),
    devoteesOf(dhamId),
  ]);
  const rows = books.filter((b) => (scope.get(b.id) ?? 0) !== 0 || (store.get(b.id) ?? 0) !== 0);
  return (
    <>
      <PageHeader
        title="Book Stock"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Stock" }]}
        doHere={`See how many books ${u.dhamName} has — in the Dham store and with each devotee.`}
        next="Receive new books when they arrive, then assign them to devotees."
        actions={
          <>
            <LinkButton href="/stock/receive" variant="secondary">📥 Receive Books</LinkButton>
            <LinkButton href="/stock/assign-devotees">🤲 Assign Books</LinkButton>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total books in my Dham" value={num(total(scope))} tone="blue" />
        <StatCard label="In the Dham store" value={num(total(store))} hint="Not yet given to devotees" />
        <StatCard label="With devotees" value={num(total(scope) - total(store))} tone="purple" />
      </div>
      <div className="mb-4"><DownloadReport kind="stock" /></div>
      <Card title="Books in my Dham" actions={<Link href="/stock/history" className="tap text-sm font-semibold text-brand-700 hover:underline">Book Movement History →</Link>}>
        {rows.length === 0 ? (
          <EmptyState title="Your Dham has no books yet." action={<LinkButton href="/stock/receive">Receive Books</LinkButton>}>
            When books arrive, record them with Receive Books. Books sent by the Admin will also appear here automatically.
          </EmptyState>
        ) : (
          <>
          <ul className="divide-y divide-stone-100 md:hidden">
            {rows.map((b) => {
              const s = store.get(b.id) ?? 0, t = scope.get(b.id) ?? 0;
              return (
                <li key={b.id} className="flex items-center gap-3 py-3">
                  <BookCover title={b.title} url={b.coverUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{b.title}</p>
                    <p className="text-xs text-ink-500">{b.language} · worth {inr(t * b.pricePaise)}</p>
                    <p className="mt-1 text-xs text-ink-700">In store <b>{num(s)}</b> · With devotees <b>{num(t - s)}</b></p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-extrabold tabular-nums">{num(t)}</p>
                    <p className="text-[11px] text-ink-500">total</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead><tr><th>Book</th><th className="text-right">In store</th><th className="text-right">With devotees</th><th className="text-right">Total</th><th className="text-right">Value</th></tr></thead>
              <tbody>
                {rows.map((b) => {
                  const s = store.get(b.id) ?? 0, t = scope.get(b.id) ?? 0;
                  return (
                    <tr key={b.id}>
                      <td><div className="flex items-center gap-2"><BookCover title={b.title} url={b.coverUrl} size={24} /><span>{b.title} <span className="text-ink-500">({b.language})</span></span></div></td>
                      <td className="text-right tabular-nums font-semibold">{num(s)}</td>
                      <td className="text-right tabular-nums">{num(t - s)}</td>
                      <td className="text-right tabular-nums font-bold">{num(t)}</td>
                      <td className="text-right tabular-nums text-ink-500">{inr(t * b.pricePaise)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
      <Card title="Books with each devotee" className="mt-4" subtitle="Copies currently with the devotee (as per approved reports)">
        <div id="devotees" />
        {devotees.length === 0 ? (
          <p className="text-sm text-ink-500">No devotees yet. <Link href="/people" className="font-semibold underline">Add a devotee</Link>.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {devotees.map((d) => {
              const m = devStocks.get(d.id) ?? new Map();
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold">{d.name}{d.id === u.id ? " (me)" : d.role === "manager" ? " (Manager)" : ""}</p>
                    <p className="text-sm text-ink-500">{num(total(m))} books with them</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/stock/assign-devotees?devotee=${d.id}`} className="btn-secondary btn-sm">Assign Books</Link>
                    {total(m) > 0 && <Link href={`/stock/take-back?devotee=${d.id}`} className="btn-secondary btn-sm">Take Back</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

async function AdminStock({ books }: { books: Awaited<ReturnType<typeof allBooks>> }) {
  const dhams = await allDhams();
  const [central, org, ...perDham] = await Promise.all([holderStock(H.central), scopeStock(null), ...dhams.map((d) => scopeStock(d.id))]);
  const rows = books.filter((b) => (org.get(b.id) ?? 0) !== 0);
  return (
    <>
      <PageHeader
        title="Book Stock"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Stock" }]}
        doHere="See where every book is: in the Central Store, at each Dham, or with devotees."
        next="Receive books when they arrive, then send them to Dhams. Managers give them to devotees."
        actions={
          <>
            <LinkButton href="/stock/receive" variant="secondary">📥 Receive Books</LinkButton>
            <LinkButton href="/stock/assign-dham">🛕 Assign Books to Dham</LinkButton>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="All books available" value={num(total(org))} tone="blue" hint="Not yet sold" />
        <StatCard label="In Central Store" value={num(total(central))} hint="Not yet sent to a Dham" />
        {dhams.slice(0, 2).map((d, i) => (
          <StatCard key={d.id} label={d.name} value={num(total(perDham[i]))} tone="purple" hint="Store + with devotees" />
        ))}
      </div>
      <div className="mb-4"><DownloadReport kind="stock" /></div>
      <Card
        title="Where are the books?"
        subtitle={<>Each Dham column includes books in the Dham store and books with its devotees.<HelpTip>Books leave this table only when a sale, return or damage is approved by a Manager.</HelpTip></>}
        actions={<Link href="/stock/history" className="tap text-sm font-semibold text-brand-700 hover:underline">Book Movement History →</Link>}
      >
        {rows.length === 0 ? (
          <EmptyState title="No books in stock yet." action={<LinkButton href="/stock/receive">Receive Books</LinkButton>}>
            When books arrive, record them with Receive Books. They will then appear here.
          </EmptyState>
        ) : (
          <>
          <ul className="space-y-3 md:hidden">
            {rows.map((b) => (
              <li key={b.id} className="rounded-xl border border-stone-200/80 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{b.title} <span className="font-normal text-ink-500">({b.language})</span></p>
                  <p className="text-right"><span className="font-display text-xl font-extrabold tabular-nums">{num(org.get(b.id) ?? 0)}</span><span className="block text-[11px] text-ink-500">total</span></p>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-ink-500">Central Store</dt><dd className="font-semibold tabular-nums">{num(central.get(b.id) ?? 0)}</dd></div>
                  {dhams.map((d, i) => (
                    <div key={d.id} className="flex justify-between gap-2"><dt className="truncate text-ink-500">{d.name}</dt><dd className="font-semibold tabular-nums">{num(perDham[i].get(b.id) ?? 0)}</dd></div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th className="text-right">Central Store</th>
                  {dhams.map((d) => <th key={d.id} className="text-right">{d.name}</th>)}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>{b.title} <span className="text-ink-500">({b.language})</span></td>
                    <td className="text-right tabular-nums">{num(central.get(b.id) ?? 0)}</td>
                    {dhams.map((d, i) => <td key={d.id} className="text-right tabular-nums">{num(perDham[i].get(b.id) ?? 0)}</td>)}
                    <td className="text-right font-bold tabular-nums">{num(org.get(b.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </>
  );
}

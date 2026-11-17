import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { assertDhamAccess, DEVOTEE_SORT, dhamDevotees, dhamInventory, dhamOverview, type DevoteeSort } from "@/lib/hierarchy";
import { fmtDate, inr, num } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { ChipLinks } from "@/components/chips";
import { Pager, TabLinks, withQuery } from "@/components/tabs";

type SP = { tab?: string; q?: string; sort?: string; dir?: string; has?: string; page?: string };

/** Level 2 — one Dham: its devotees (default tab) and its book inventory. */
export default async function DhamDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const u = await requireUser("admin", "manager");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  assertDhamAccess(u, id);
  const sp = await searchParams;
  const [dham] = await dhamOverview(id);
  if (!dham) notFound();

  const tab = sp.tab === "inventory" ? "inventory" : "devotees";
  const base = `/dham/${id}`;
  const listState = { q: sp.q, sort: sp.sort, dir: sp.dir, has: sp.has, page: sp.page };
  const isAdmin = u.role === "admin";
  const crumbs = isAdmin
    ? [{ label: "Chakra Sevak", href: "/dashboard" }, { label: "Dhams", href: "/dham" }, { label: dham.name }]
    : [{ label: "Sector Sevak", href: "/dashboard" }, { label: "My Dham" }];

  return (
    <>
      <PageHeader
        title={tab === "devotees" ? `Devotees — ${dham.name}` : `Book Inventory — ${dham.name}`}
        crumbs={[...crumbs.slice(0, -1), { label: crumbs.at(-1)!.label, href: base }, { label: tab === "devotees" ? "Devotees" : "Book Inventory" }]}
        doHere={tab === "devotees" ? "Search or sort the list, then tap a devotee to see their books, sales and history." : "Book-wise stock of this Dham: what came in, what is on the shelf, with devotees and sold."}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On the Dham shelf" value={num(dham.available)} tone="blue" href={`/availability?dham=${id}&show=shelf&view=dham`} hint="Tap: book names & counts" />
        <StatCard label="With devotees now" value={num(dham.withDevotees)} tone="purple" href={`/availability?dham=${id}&show=devotees`} hint="Tap: who has which book" />
        <StatCard label="Sold (approved)" value={num(dham.sold)} tone="green" hint={inr(dham.amount)} href={`/distribution/${id}`} />
        <StatCard label="Received by Dham" value={num(dham.received)} href={`/stock/history?dham=${id}`} hint={`Given to devotees ${num(dham.allocated)}`} />
      </div>
      <TabLinks
        label="Dham sections"
        items={[
          { href: withQuery(base, listState), label: "👥 Devotees", active: tab === "devotees", count: dham.devotees },
          { href: withQuery(base, { tab: "inventory" }), label: "📦 Book Inventory", active: tab === "inventory" },
        ]}
      />
      {tab === "devotees" ? <Devotees id={id} base={base} sp={sp} /> : <Inventory id={id} />}
    </>
  );
}

async function Devotees({ id, base, sp }: { id: number; base: string; sp: SP }) {
  const page = Number(sp.page) || 1;
  const sort = (sp.sort && sp.sort in DEVOTEE_SORT ? sp.sort : "name") as DevoteeSort;
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : sort === "name" ? "asc" : "desc";
  const res = await dhamDevotees(id, { q: sp.q, sort, dir, has: sp.has, page });
  const state = { q: sp.q, sort: sp.sort, dir: sp.dir, has: sp.has };
  // Remember this list (search, sort, page) so "Back to devotees" returns to the same place.
  const ret = new URLSearchParams(Object.entries({ ...state, page: res.page > 1 ? String(res.page) : undefined }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <Card>
      <form action={base} className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        {sp.has && <input type="hidden" name="has" value={sp.has} />}
        <label className="sr-only" htmlFor="q">Search devotees</label>
        <input id="q" name="q" defaultValue={sp.q} placeholder="🔍 Search name or phone" className="field-input py-2.5 text-sm" />
        <label className="sr-only" htmlFor="sort">Sort by</label>
        <select id="sort" name="sort" defaultValue={sort} className="field-input py-2.5 text-sm">
          {Object.entries(DEVOTEE_SORT).map(([k, v]) => <option key={k} value={k}>Sort: {v.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="dir">Order</label>
        <select id="dir" name="dir" defaultValue={dir} className="field-input py-2.5 text-sm">
          <option value="desc">High → low / Z → A</option>
          <option value="asc">Low → high / A → Z</option>
        </select>
        <button className="btn-primary btn-sm">Search</button>
      </form>
      <div className="mb-3">
        <ChipLinks
          label="Show"
          items={[
            { href: withQuery(base, { ...state, has: undefined }), label: "All active", active: !sp.has },
            { href: withQuery(base, { ...state, has: "with" }), label: "Holding books", active: sp.has === "with" },
            { href: withQuery(base, { ...state, has: "none" }), label: "No books left", active: sp.has === "none" },
            { href: withQuery(base, { ...state, has: "inactive" }), label: "Inactive", active: sp.has === "inactive" },
          ]}
        />
      </div>
      <p className="mb-2 text-xs text-ink-500">{num(res.total)} devotee{res.total === 1 ? "" : "s"}{sp.q ? ` matching “${sp.q}”` : ""}</p>

      {res.rows.length === 0 ? (
        <EmptyState icon="🙏" title={sp.q ? "No devotee matches this search." : "No devotees here yet."}>
          {sp.q ? "Try another name or clear the search." : "Add devotees in Settings → Sector Sevaks & Devotees."}
        </EmptyState>
      ) : (
        <>
          {/* Phones: one tappable card per devotee */}
          <ul className="space-y-2 md:hidden">
            {res.rows.map((d) => (
              <li key={d.id}>
                <Link href={withQuery(`${base}/devotee/${d.id}`, { ret })} data-testid="devotee-row" className="block rounded-xl border border-stone-200/80 p-3 transition hover:border-brand-300 hover:bg-brand-50/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{d.name} {d.role === "manager" && <Badge tone="blue">Sector Sevak</Badge>}</p>
                    <span className="text-brand-700" aria-hidden>›</span>
                  </div>
                  <p className="mt-1 grid grid-cols-4 gap-1 text-center text-[11px] text-ink-500">
                    <span>Given<br /><b className="text-sm text-ink-900">{num(d.allocated)}</b></span>
                    <span>Sold<br /><b className="text-sm text-ink-900">{num(d.sold)}</b></span>
                    <span>Returned<br /><b className="text-sm text-ink-900">{num(d.returned + d.damaged)}</b></span>
                    <span>Left<br /><b className="text-sm text-brand-700">{num(d.remaining)}</b></span>
                  </p>
                  <p className="mt-1 text-xs text-ink-500">{inr(d.amount)} · {d.lastSale ? `Last sale ${fmtDate(d.lastSale)}` : "No sales yet"}{d.pendingSold ? ` · ${num(d.pendingSold)} waiting approval` : ""}</p>
                </Link>
              </li>
            ))}
          </ul>
          {/* Larger screens: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500">
                <tr className="border-b border-stone-200">
                  <th className="py-2 pr-3">Devotee</th>
                  <th className="px-2 text-right">Given</th>
                  <th className="px-2 text-right">Sold</th>
                  <th className="px-2 text-right">Returned</th>
                  <th className="px-2 text-right">Left</th>
                  <th className="px-2 text-right">Sales amount</th>
                  <th className="pl-2">Last sale</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((d) => {
                  const href = withQuery(`${base}/devotee/${d.id}`, { ret });
                  return (
                    <tr key={d.id} className="border-b border-stone-100 hover:bg-brand-50/30">
                      <td className="py-2.5 pr-3">
                        <Link href={href} data-testid="devotee-row" className="font-semibold text-brand-700 hover:underline">{d.name}</Link>
                        {d.role === "manager" && <> <Badge tone="blue">Sector Sevak</Badge></>}
                        {d.phone && <span className="block text-xs text-ink-500">{d.phone}</span>}
                      </td>
                      <td className="px-2 text-right tabular-nums">{num(d.allocated)}</td>
                      <td className="px-2 text-right tabular-nums">{num(d.sold)}{d.pendingSold ? <span className="block text-[11px] text-amber-700">+{num(d.pendingSold)} waiting</span> : null}</td>
                      <td className="px-2 text-right tabular-nums" title={d.damaged ? `${d.damaged} damaged / lost` : undefined}>{num(d.returned + d.damaged)}</td>
                      <td className="px-2 text-right font-bold tabular-nums text-brand-700">{num(d.remaining)}</td>
                      <td className="px-2 text-right tabular-nums">{inr(d.amount)}</td>
                      <td className="pl-2 text-ink-600">{d.lastSale ? fmtDate(d.lastSale) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">Sold and amount count approved reports. Returned includes damaged / lost copies. Left = given − sold − returned.</p>
        </>
      )}
      <Pager page={res.page} pages={res.pages} href={(p) => withQuery(base, { ...state, page: p > 1 ? p : undefined })} />
    </Card>
  );
}

async function Inventory({ id }: { id: number }) {
  const rows = await dhamInventory(id);
  return (
    <Card title="Books held by this Dham" subtitle="On shelf = physically at the Dham now. With devotees = given out and not yet sold or returned.">
      {rows.length === 0 ? (
        <EmptyState icon="📦" title="No books have reached this Dham yet.">Assign books from Book Stock → Assign to Dham.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr className="border-b border-stone-200">
                <th className="py-2 pr-3">Book</th>
                <th className="px-2 text-right">Received</th>
                <th className="px-2 text-right">On shelf</th>
                <th className="px-2 text-right">Given out</th>
                <th className="px-2 text-right">With devotees</th>
                <th className="px-2 text-right">Sold</th>
                <th className="px-2 text-right">Returned</th>
                <th className="pl-2 text-right">Damaged</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-stone-100">
                  <td className="py-2.5 pr-3 font-medium">{b.title} <span className="text-ink-500">({b.language})</span> <Badge tone={b.size === "big" ? "purple" : "blue"}>{b.size === "big" ? "Big" : "Small"}</Badge></td>
                  <td className="px-2 text-right tabular-nums">{num(b.received)}</td>
                  <td className="px-2 text-right font-bold tabular-nums text-sky-700">{num(b.available)}</td>
                  <td className="px-2 text-right tabular-nums">{num(b.allocated)}</td>
                  <td className="px-2 text-right font-bold tabular-nums text-violet-700">{num(b.withDevotees)}</td>
                  <td className="px-2 text-right tabular-nums">{num(b.sold)}</td>
                  <td className="px-2 text-right tabular-nums">{num(b.returned)}</td>
                  <td className="pl-2 text-right tabular-nums">{num(b.damaged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

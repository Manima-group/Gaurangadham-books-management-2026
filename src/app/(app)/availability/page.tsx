import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { availability, availabilityScope } from "@/lib/availability";
import { num } from "@/lib/format";
import { SIZE_LABEL } from "@/lib/terms";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { TabLinks, withQuery } from "@/components/tabs";

type SP = { view?: string; dham?: string; q?: string; show?: string };

/** Book Availability — which Dham shelf and which devotee holds each book right now. */
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  const scope = availabilityScope(u);
  if (!scope.allowed) redirect("/dashboard?denied=1");
  const sp = await searchParams;
  const all = scope.dhamIds == null;
  const dhamFilter = all && sp.dham ? Number(sp.dham) : null;
  const { books, dhams, dhamName } = await availability(dhamFilter ? [dhamFilter] : scope.dhamIds);
  const view = sp.view === "dham" ? "dham" : "book";
  const show = sp.show === "shelf" || sp.show === "devotees" ? sp.show : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const list = books.filter(
    (b) =>
      (!q || `${b.title} ${b.language}`.toLowerCase().includes(q)) &&
      (show === "all" || (show === "shelf" ? b.shelf > 0 : b.withDevotees > 0)),
  );
  const shelf = books.reduce((a, b) => a + b.shelf, 0);
  const withDev = books.reduce((a, b) => a + b.withDevotees, 0);
  const transit = books.reduce((a, b) => a + b.inTransit, 0);
  const base = "/availability";
  const state = { view, dham: sp.dham, q: sp.q, show: sp.show };
  const scopeName = dhamFilter ? dhamName.get(dhamFilter) : all ? "all Dhams" : u.dhamName;

  return (
    <>
      <PageHeader
        title="Book Availability"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Availability" }]}
        doHere={`Books available right now in ${scopeName}: on the Dham shelf and with devotees. Tap a book to see who has it, with mobile numbers.`}
        next={u.role === "manager" ? "Need books another Dham has? Ask for them with Dham Transfers." : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On Dham shelves" value={num(shelf)} tone="blue" icon="📦" href={withQuery(base, { ...state, show: "shelf" })} hint="Tap to see only these" />
        <StatCard label="With devotees" value={num(withDev)} tone="purple" icon="🙋" href={withQuery(base, { ...state, show: "devotees" })} hint="Tap to see only these" />
        <StatCard label="Book titles available" value={num(books.length)} tone="green" icon="📚" href={withQuery(base, { ...state, show: undefined })} />
        {all && !dhamFilter ? (
          <StatCard label="On the way between Dhams" value={num(transit)} tone="amber" icon="🚚" href="/transfers?status=sent" hint="Sent, not yet received" />
        ) : (
          <StatCard label="Dhams shown" value={num(dhams.length)} tone="gray" icon="🛕" />
        )}
      </div>

      <form action={base} className="mb-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        {sp.show && <input type="hidden" name="show" value={sp.show} />}
        <label className="flex flex-col text-sm font-semibold text-ink-700">
          Search a book
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Book name or language" className="field-input mt-1 py-2" />
        </label>
        {all && (
          <label className="flex flex-col text-sm font-semibold text-ink-700">
            Dham
            <select name="dham" defaultValue={sp.dham ?? ""} className="field-input mt-1 py-2">
              <option value="">All Dhams</option>
              {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn-primary btn-sm">Show</button>
        {(sp.q || sp.dham || sp.show) && <Link href={withQuery(base, { view })} className="btn-secondary btn-sm">Clear</Link>}
      </form>

      <TabLinks
        label="Show availability"
        items={[
          { label: "By book", href: withQuery(base, { ...state, view: "book" }), active: view === "book" },
          { label: "By Dham", href: withQuery(base, { ...state, view: "dham" }), active: view === "dham" },
        ]}
      />

      {list.length === 0 ? (
        <EmptyState icon="📭" title={q || show !== "all" ? "No books match." : "No books are available right now."}>
          {q ? "Try another name or clear the search." : "Books appear here once they are received at a Dham."}
        </EmptyState>
      ) : view === "book" ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((b) => (
            <li key={b.id}>
              <Link href={withQuery(`/availability/${b.id}`, { dham: dhamFilter ? String(dhamFilter) : undefined })} className="block rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card hover:ring-2 hover:ring-brand-300" data-testid="avail-book">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">{b.title}</p>
                    <p className="text-sm text-ink-500">{b.language} · {SIZE_LABEL[b.size]}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-bold text-ink-900">{num(b.shelf + b.withDevotees)}</p>
                    <p className="text-xs text-ink-500">available</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Badge tone="blue">📦 Shelf {num(b.shelf)}</Badge>
                  <Badge tone="purple">🙋 Devotees {num(b.withDevotees)}</Badge>
                  {b.inTransit > 0 && <Badge tone="amber">🚚 On the way {num(b.inTransit)}</Badge>}
                </div>
                {dhams.length > 1 && (
                  <p className="mt-2 text-sm text-ink-700">
                    {[...b.byDham.entries()].map(([d, v]) => `${dhamName.get(d)} ${num(v.shelf + v.withDevotees)}`).join(" · ")}
                  </p>
                )}
                <p className="mt-2 text-sm font-semibold text-brand-700">See who has it →</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          {dhams.map((d) => {
            const rows = list.filter((b) => b.byDham.has(d.id));
            const sum = rows.reduce((a, b) => { const v = b.byDham.get(d.id)!; return a + v.shelf + v.withDevotees; }, 0);
            return (
              <Card key={d.id} title={`${d.name} — ${num(sum)} books`}>
                {rows.length === 0 ? (
                  <p className="text-sm text-ink-500">No books available in this Dham.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-ink-500">
                          <th className="py-2 pr-3 font-semibold">Book</th>
                          <th className="py-2 pr-3 text-right font-semibold">On shelf</th>
                          <th className="py-2 pr-3 text-right font-semibold">With devotees</th>
                          <th className="py-2 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {rows.map((b) => {
                          const v = b.byDham.get(d.id)!;
                          return (
                            <tr key={b.id}>
                              <td className="py-2 pr-3">
                                <Link href={`/availability/${b.id}?dham=${d.id}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">{b.title}</Link>
                                <span className="text-ink-500"> · {b.language}</span>
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">{num(v.shelf)}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{num(v.withDevotees)}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{num(v.shelf + v.withDevotees)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

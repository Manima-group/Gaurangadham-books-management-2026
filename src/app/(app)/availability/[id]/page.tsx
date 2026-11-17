import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { availability, availabilityScope } from "@/lib/availability";
import { num } from "@/lib/format";
import { SIZE_LABEL } from "@/lib/terms";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

/** One book: how many on each Dham shelf, and which devotees hold it — with mobile numbers to contact. */
export default async function AvailabilityBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dham?: string }>;
}) {
  const u = await requireUser();
  const scope = availabilityScope(u);
  if (!scope.allowed) redirect("/dashboard?denied=1");
  const { id } = await params;
  const sp = await searchParams;
  const bookId = Number(id);
  if (!Number.isInteger(bookId)) notFound();
  const dhamFilter = scope.dhamIds == null && sp.dham ? Number(sp.dham) : null;
  const { books, dhamName } = await availability(dhamFilter ? [dhamFilter] : scope.dhamIds);
  const b = books.find((x) => x.id === bookId);
  const tel = (p: string) => p.replace(/\D/g, "");
  const wa = (p: string) => { const d = tel(p); return d.length === 10 ? `91${d}` : d; };

  return (
    <>
      <PageHeader
        title={b ? b.title : "Book not available"}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Availability", href: dhamFilter ? `/availability?dham=${dhamFilter}` : "/availability" }, { label: b?.title ?? "Book" }]}
        doHere={b ? `${b.language} · ${SIZE_LABEL[b.size]}. Call or WhatsApp a devotee who has this book, or ask the Dham that has it on the shelf.` : undefined}
        next={u.role === "manager" && b ? <Link href={`/transfers/new?book=${b.id}`} className="font-semibold text-brand-700 underline">Ask another Dham for this book →</Link> : undefined}
      />
      {!b ? (
        <EmptyState icon="📭" title="Nobody has this book right now.">
          <Link href="/availability" className="btn-secondary btn-sm">Back to Book Availability</Link>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="On Dham shelves" value={num(b.shelf)} tone="blue" icon="📦" href="#shelves" />
            <StatCard label="With devotees" value={num(b.withDevotees)} tone="purple" icon="🙋" href="#devotees" />
            {b.inTransit > 0 && <StatCard label="On the way" value={num(b.inTransit)} tone="amber" icon="🚚" href="/transfers?status=sent" />}
          </div>

          <div id="shelves">
            <Card title="On Dham shelves">
              {[...b.byDham.entries()].filter(([, v]) => v.shelf > 0).length === 0 ? (
                <p className="text-sm text-ink-500">No Dham has this book on its shelf.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {[...b.byDham.entries()].filter(([, v]) => v.shelf > 0).sort((a, z) => z[1].shelf - a[1].shelf).map(([d, v]) => (
                    <li key={d} className="flex items-center justify-between py-2">
                      <span className="font-semibold text-ink-900">🛕 {dhamName.get(d)}</span>
                      <span className="font-display text-lg font-bold tabular-nums">{num(v.shelf)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div id="devotees" className="mt-4">
            <Card title={`With devotees (${b.devotees.length})`}>
              {b.devotees.length === 0 ? (
                <p className="text-sm text-ink-500">No devotee is holding this book now.</p>
              ) : (
                <ul className="divide-y divide-stone-100" data-testid="avail-devotees">
                  {b.devotees.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-semibold text-ink-900">{d.name}</p>
                        <p className="text-sm text-ink-500">
                          {dhamName.get(d.dhamId)}{d.phone ? <> · <span className="tabular-nums">{d.phone}</span></> : " · no mobile saved"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-stone-100 px-2.5 py-1 font-display text-lg font-bold tabular-nums">{num(d.qty)}</span>
                        {d.phone && (
                          <>
                            <a href={`tel:${tel(d.phone)}`} className="btn-secondary btn-sm" aria-label={`Call ${d.name}`}>📞 Call</a>
                            <a href={`https://wa.me/${wa(d.phone)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" aria-label={`WhatsApp ${d.name}`}>💬 WhatsApp</a>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

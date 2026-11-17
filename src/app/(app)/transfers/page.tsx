import Link from "next/link";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { listTransfers } from "@/lib/transfers";
import { fmtDateTime, num } from "@/lib/format";
import { TRANSFER_STATUS } from "@/lib/terms";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { ChipLinks } from "@/components/chips";
import { withQuery } from "@/components/tabs";

type SP = { status?: string; box?: string };

/** Dham Transfers — requests between Dhams: asked → approved → sent → received. */
export default async function TransfersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const status = sp.status && TRANSFER_STATUS[sp.status] ? sp.status : undefined;
  const { rows: all, lines } = await listTransfers(u);
  const dhams = await db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham);
  const books = await db.select({ id: schema.book.id, title: schema.book.title }).from(schema.book);
  const dn = (id: number) => dhams.find((d) => d.id === id)?.name ?? "Dham";
  const bt = (id: number) => books.find((b) => b.id === id)?.title ?? "Book";
  const mine = u.dhamId ?? -1;
  const box = u.role === "manager" && (sp.box === "in" || sp.box === "out") ? sp.box : undefined;
  const rows = all.filter((r) => (!status || r.status === status) && (!box || (box === "in" ? r.fromDhamId === mine : r.toDhamId === mine)));
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const todo = u.role === "manager"
    ? all.filter((r) => (r.fromDhamId === mine && (r.status === "requested" || r.status === "approved")) || (r.toDhamId === mine && r.status === "sent")).length
    : 0;
  const base = "/transfers";

  return (
    <>
      <PageHeader
        title="Dham Transfers"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Dham Transfers" }]}
        doHere="Books moving between Dhams. The Dham that needs books asks → the Dham that has them approves and sends → the asking Dham taps Received. Counts update only when books are sent and received."
        actions={u.role === "manager" ? <Link href="/transfers/new" className="btn-primary btn-sm">➕ Ask another Dham for books</Link> : undefined}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {u.role === "manager" && <StatCard label="Waiting for you" value={num(todo)} tone="amber" icon="⏳" hint="Approve, send or receive" href={withQuery(base, { box: undefined })} />}
        <StatCard label="Requested" value={num(count("requested"))} tone="blue" icon="📨" href={withQuery(base, { status: "requested", box })} />
        <StatCard label="On the way" value={num(count("sent"))} tone="amber" icon="🚚" href={withQuery(base, { status: "sent", box })} />
        <StatCard label="Received" value={num(count("received"))} tone="green" icon="✅" href={withQuery(base, { status: "received", box })} />
      </div>
      {u.role === "manager" && (
        <div className="mb-2">
          <ChipLinks
            label="Which requests"
            items={[
              { label: "All", href: withQuery(base, { status }), active: !box },
              { label: "Asked from my Dham", href: withQuery(base, { status, box: "in" }), active: box === "in" },
              { label: "My Dham asked", href: withQuery(base, { status, box: "out" }), active: box === "out" },
            ]}
          />
        </div>
      )}
      <div className="mb-4">
        <ChipLinks
          label="Status"
          items={[
            { label: "Any status", href: withQuery(base, { box }), active: !status },
            ...Object.entries(TRANSFER_STATUS).map(([k, v]) => ({ label: v.label, href: withQuery(base, { status: k, box }), active: status === k })),
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="🚚" title="No transfers here yet.">
          {u.role === "manager" ? "Need books another Dham has? Tap “Ask another Dham for books”." : "Sector Sevaks ask other Dhams for books here."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const st = TRANSFER_STATUS[r.status];
            const ls = lines.filter((l) => l.transferId === r.id);
            const qty = ls.reduce((a, l) => a + (r.status === "requested" ? l.requestedQty : l.sentQty ?? l.requestedQty), 0);
            return (
              <li key={r.id}>
                <Link href={`/transfers/${r.id}`} className="block rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card hover:ring-2 hover:ring-brand-300" data-testid="transfer-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink-900">#{r.id} · {dn(r.fromDhamId)} → {dn(r.toDhamId)}</p>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{num(qty)} books: {ls.map((l) => bt(l.bookId)).join(", ")}</p>
                  <p className="mt-1 text-xs text-ink-500">Asked {fmtDateTime(r.requestedAt)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

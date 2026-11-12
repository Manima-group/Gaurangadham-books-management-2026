import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { allBooks, allDhams } from "@/lib/lookups";
import { fmtDate, num } from "@/lib/format";
import { MOVEMENT_LABEL } from "@/lib/terms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filters";
import { DeleteButton } from "@/components/delete";
import { undoMovement } from "@/app/actions/stock";

const TONE: Record<string, "blue" | "purple" | "green" | "amber" | "red" | "gray"> = {
  received: "blue", assign_dham: "purple", assign_devotee: "purple", sold: "green", returned: "amber", damaged: "red", correction: "gray",
};
const PAGE = 50;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sm = schema.stockMovement;
  const conds: SQL[] = [];
  if (u.role === "manager") conds.push(eq(sm.dhamId, u.dhamId!));
  else if (sp.dham) conds.push(eq(sm.dhamId, Number(sp.dham)));
  if (sp.book) conds.push(eq(sm.bookId, Number(sp.book)));
  if (sp.kind) conds.push(eq(sm.kind, sp.kind as "sold"));
  if (sp.from) conds.push(gte(sm.movementDate, sp.from));
  if (sp.to) conds.push(lte(sm.movementDate, sp.to));

  const [rows, books, dhams, people] = await Promise.all([
    db.select().from(sm).where(conds.length ? and(...conds) : undefined).orderBy(desc(sm.movementDate), desc(sm.id)).limit(PAGE + 1).offset((page - 1) * PAGE),
    allBooks(),
    allDhams(),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user),
  ]);
  const bookName = new Map(books.map((b) => [b.id, `${b.title} (${b.language})`]));
  const name = new Map(people.map((p) => [p.id, p.name]));
  const dhamName = new Map(dhams.map((d) => [d.id, d.name]));
  const holder = (h: string) =>
    h === "central" ? "Central Store" : h === "external" ? "Supplier" : h === "sold" ? "Sold to public" : h === "damaged" ? "Damaged / lost" :
    h.startsWith("dham:") ? `${dhamName.get(Number(h.slice(5))) ?? "Dham"} store` : h.startsWith("devotee:") ? name.get(h.slice(8)) ?? "Devotee" : h;
  const more = rows.length > PAGE;
  const canUndo = (r: (typeof rows)[number]) =>
    !r.reversedBy && r.kind !== "correction" && !r.reportId && (u.role === "admin" || (r.dhamId === u.dhamId && r.kind !== "assign_dham"));
  const qs = (p: number) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(p) }).toString();

  return (
    <>
      <PageHeader
        title="Book Movement History"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Stock", href: "/stock" }, { label: "Book Movement History" }]}
        doHere="See every time books were received, given out, sold, returned or damaged. Made a mistake? Press Undo — a correction is added and both stay in the history."
        next="Use the filters to find a particular book, type of movement or date."
      />
      <Card className="mb-4">
        <FilterBar
          action="/stock/history"
          values={sp}
          dhams={u.role === "admin" ? dhams.map((d) => ({ value: d.id, label: d.name })) : undefined}
          extra={
            <>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">
                Book
                <select name="book" defaultValue={sp.book ?? ""} className="field-input py-2.5 text-sm font-normal">
                  <option value="">All books</option>
                  {books.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.language})</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">
                What happened
                <select name="kind" defaultValue={sp.kind ?? ""} className="field-input py-2.5 text-sm font-normal">
                  <option value="">All types</option>
                  {Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </>
          }
        />
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="🕘" title="No book movements found.">Try removing some filters. Movements appear when books are received, assigned, sold or returned.</EmptyState>
        ) : (
          <>
          <ul className="divide-y divide-stone-100 md:hidden">
            {rows.slice(0, PAGE).map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={TONE[r.kind]}>{MOVEMENT_LABEL[r.kind]}</Badge>
                  <span className="text-xs text-ink-500">{fmtDate(r.movementDate)}</span>
                </div>
                <div className="mt-1.5 flex items-start justify-between gap-3">
                  <p className="font-medium leading-snug">{bookName.get(r.bookId)}</p>
                  <p className="font-display text-lg font-extrabold tabular-nums">{num(r.qty)}</p>
                </div>
                <p className="text-sm text-ink-700">{holder(r.fromHolder)} → {holder(r.toHolder)}</p>
                {(r.reference || r.note || r.reportId) && <p className="text-xs text-ink-500">{[r.reference, r.note].filter(Boolean).join(" · ") || "From daily report"}</p>}
                {r.reversedBy && <Badge>Undone</Badge>}
                {canUndo(r) && <div className="mt-2"><DeleteButton action={undoMovement} id={r.id} label="Undo" confirm={`Undo ${r.qty} × ${bookName.get(r.bookId) ?? "book"}?`} /></div>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead><tr><th>Date</th><th>What happened</th><th>Book</th><th className="text-right">Copies</th><th>From → To</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {rows.slice(0, PAGE).map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDate(r.movementDate)}</td>
                    <td><Badge tone={TONE[r.kind]}>{MOVEMENT_LABEL[r.kind]}</Badge></td>
                    <td>{bookName.get(r.bookId)}</td>
                    <td className="text-right font-bold tabular-nums">{num(r.qty)}</td>
                    <td className="text-ink-700">{holder(r.fromHolder)} → {holder(r.toHolder)}</td>
                    <td className="text-ink-500">{[r.reference, r.note].filter(Boolean).join(" · ") || (r.reportId ? "From daily report" : "")}</td>
                    <td className="text-right">{r.reversedBy ? <Badge>Undone</Badge> : canUndo(r) ? <DeleteButton action={undoMovement} id={r.id} label="Undo" confirm="Undo this?" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="mt-4 flex justify-between">
          {page > 1 ? <a className="btn-secondary btn-sm" href={qs(page - 1)}>← Newer</a> : <span />}
          {more && <a className="btn-secondary btn-sm" href={qs(page + 1)}>Older →</a>}
        </div>
      </Card>
    </>
  );
}

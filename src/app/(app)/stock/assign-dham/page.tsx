import { requireUser } from "@/lib/session";
import { activeBooks, activeDhams } from "@/lib/lookups";
import { H, holderStock, scopeStock, total } from "@/lib/stock";
import { num, todayIST } from "@/lib/format";
import { assignToDham } from "@/app/actions/stock";
import { AllocationForm } from "@/components/allocation";
import { Card, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";

export default async function AssignDhamPage({ searchParams }: { searchParams: Promise<{ dham?: string }> }) {
  await requireUser("admin");
  const sp = await searchParams;
  const [books, dhams, central] = await Promise.all([activeBooks(), activeDhams(), holderStock(H.central)]);
  const dham = dhams.find((d) => String(d.id) === sp.dham);
  const dhamStock = dham ? await scopeStock(dham.id) : null;
  const avail = books.filter((b) => (central.get(b.id) ?? 0) > 0).map((b) => ({ id: b.id, title: b.title, language: b.language, coverUrl: b.coverUrl, available: central.get(b.id)! }));
  return (
    <>
      <PageHeader
        title="Assign Books to Dham"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Stock", href: "/stock" }, { label: "Assign Books to Dham" }]}
        doHere="Send books from the Central Store to a Dham: choose the Dham, enter quantities, review and confirm."
        next="The Dham Manager is notified and can give the books to devotees."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="1. Choose the Dham" className="lg:col-span-1">
          {dhams.length === 0 ? (
            <EmptyState title="No Dhams yet" action={<LinkButton href="/dhams" size="sm">Add a Dham</LinkButton>} />
          ) : (
            <form className="space-y-3" action="/stock/assign-dham">
              <Field label="Dham" htmlFor="dham">
                <select id="dham" name="dham" defaultValue={sp.dham ?? ""} className="field-input">
                  <option value="">Choose a Dham…</option>
                  {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <button className="btn-secondary w-full">Continue</button>
              {dham && dhamStock && <p className="text-sm text-ink-500">{dham.name} currently has <b>{num(total(dhamStock))}</b> books (store + devotees).</p>}
            </form>
          )}
        </Card>
        <Card title={dham ? `2. Books to send to ${dham.name}` : "2. Choose books and quantities"} className="lg:col-span-2">
          {!dham ? (
            <p className="text-sm text-ink-500">First choose a Dham in step 1.</p>
          ) : (
            <AllocationForm
              key={dham.id}
              action={assignToDham}
              books={avail}
              hidden={{ dhamId: String(dham.id), date: todayIST() }}
              sourceLabel="the Central Store"
              targetLabel={dham.name}
              verb="send"
              confirmLabel={`Confirm — Assign to ${dham.name}`}
              emptyText={<EmptyState title="The Central Store has no books right now." action={<LinkButton href="/stock/receive">Receive Books</LinkButton>}>Receive books first, then send them to a Dham.</EmptyState>}
            />
          )}
        </Card>
      </div>
    </>
  );
}

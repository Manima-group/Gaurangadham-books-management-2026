import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listContacts, type ContactFilter } from "@/lib/outreach";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ContactList } from "../list";

/** My Contacts — only the records this person collected, with search and dates. */
export default async function MyContactsPage({ searchParams }: { searchParams: Promise<ContactFilter> }) {
  const u = await requireUser("contact", "manager", "admin");
  const sp = await searchParams;
  const f = { q: sp.q, from: sp.from, to: sp.to, page: sp.page };
  const data = await listContacts(u, f, true);
  return (
    <>
      <PageHeader
        title="My Contacts"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "My Contacts" }]}
        doHere="Everyone you added. Search by name, number or area, or pick dates. Tap a contact to correct it."
        actions={<Link href="/contacts/new" className="btn-primary btn-sm">➕ Add New Contact</Link>}
      />
      <form action="/contacts/mine" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <label className="col-span-2 text-xs font-semibold text-ink-600 sm:w-64">Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Name, mobile or area" className="field-input mt-1" /></label>
        <label className="text-xs font-semibold text-ink-600">From<input type="date" name="from" defaultValue={sp.from ?? ""} className="field-input mt-1" /></label>
        <label className="text-xs font-semibold text-ink-600">To<input type="date" name="to" defaultValue={sp.to ?? ""} className="field-input mt-1" /></label>
        <button className="btn-primary btn-sm">Show</button>
        {(sp.q || sp.from || sp.to) && <Link href="/contacts/mine" className="btn-secondary btn-sm">Clear</Link>}
      </form>
      <p className="mb-2 text-sm text-ink-600" data-testid="mine-total">{num(data.total)} contacts</p>
      <ContactList data={data} base="/contacts/mine" keep={{ q: sp.q, from: sp.from, to: sp.to }} showCollector={false} />
    </>
  );
}

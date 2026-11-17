import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { contactStats, DUP_LABEL, INTERESTS, listContacts, type ContactFilter } from "@/lib/outreach";
import { num, todayIST } from "@/lib/format";
import { Card, PageHeader, Section, StatCard } from "@/components/ui";
import { withQuery } from "@/components/tabs";
import { DownloadReport } from "@/components/download";
import { ContactList } from "./list";
import { EventForm } from "./form";
import { eventsFor } from "./data";

/** Outreach Contacts for Chakra Sevak (all Dhams) and Sector Sevak (own Dham): records, filters, duplicate review, events. */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<ContactFilter> }) {
  const u = await requireUser("contact", "manager", "admin");
  if (u.role === "contact") redirect("/contacts/mine");
  const sp = await searchParams;
  const keep = { q: sp.q, from: sp.from, to: sp.to, dham: sp.dham, collector: sp.collector, event: sp.event, interest: sp.interest, dup: sp.dup, consent: sp.consent };
  const [data, stats, dhams, collectors, events] = await Promise.all([
    listContacts(u, { ...keep, page: sp.page }),
    contactStats(u, {}),
    u.role === "admin" ? db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).orderBy(asc(schema.dham.name)) : Promise.resolve([]),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
      .where(and(inArray(schema.user.role, ["contact", "manager", "admin"]), u.role === "manager" ? eq(schema.user.dhamId, u.dhamId ?? -1) : undefined)).orderBy(asc(schema.user.name)),
    eventsFor(u),
  ]);
  const base = "/contacts";
  return (
    <>
      <PageHeader
        title="Outreach Contacts"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Outreach Contacts" }]}
        doHere={u.role === "manager" ? `People met by volunteers of ${u.dhamName}, with what they are interested in. Review possible duplicates and add events.` : "People met by volunteers in every Dham, with what they are interested in. Review possible duplicates and add events."}
        next="Contact Collection Sevaks are added from Sevaks & Devotees (role: Contact Collection Sevak). Contact details are only for inviting people to what they chose."
        actions={
          <>
            <Link href="/contacts/new" className="btn-primary btn-sm">➕ Add Contact</Link>
            <Link href="/contacts/reports" className="btn-secondary btn-sm">📈 Reports</Link>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="📇" label="Total contacts" value={num(stats.total)} href={base} hint={`${num(stats.unique)} unique numbers`} />
        <StatCard icon="📅" label="Collected today" value={num(stats.today)} tone="blue" href={withQuery(base, { from: todayIST(), to: todayIST() })} />
        <StatCard icon="⚠️" label="Possible duplicates" value={num(stats.toReview)} tone={stats.toReview ? "amber" : "gray"} href={withQuery(base, { dup: "possible" })} hint="Tap to review" />
        <StatCard icon="✅" label="Consent recorded" value={num(stats.consent)} tone="green" href={withQuery(base, { consent: "yes" })} />
      </div>

      <form action={base} className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-card sm:grid-cols-3 lg:grid-cols-5">
        <label className="col-span-2 text-xs font-semibold text-ink-600 sm:col-span-1">Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Name, mobile, area" className="field-input mt-1" /></label>
        {u.role === "admin" && (
          <label className="text-xs font-semibold text-ink-600">Dham<select name="dham" defaultValue={sp.dham ?? ""} className="field-input mt-1"><option value="">All</option>{dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        )}
        <label className="text-xs font-semibold text-ink-600">Collected by<select name="collector" defaultValue={sp.collector ?? ""} className="field-input mt-1"><option value="">Anyone</option>{collectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-ink-600">Event<select name="event" defaultValue={sp.event ?? ""} className="field-input mt-1"><option value="">Any</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-ink-600">Interest<select name="interest" defaultValue={sp.interest ?? ""} className="field-input mt-1"><option value="">Any</option>{INTERESTS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
        <label className="text-xs font-semibold text-ink-600">Duplicate check<select name="dup" defaultValue={sp.dup ?? ""} className="field-input mt-1"><option value="">Any</option>{Object.entries(DUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label className="text-xs font-semibold text-ink-600">Consent<select name="consent" defaultValue={sp.consent ?? ""} className="field-input mt-1"><option value="">Any</option><option value="yes">Given</option><option value="no">Not given</option></select></label>
        <label className="text-xs font-semibold text-ink-600">From<input type="date" name="from" defaultValue={sp.from ?? ""} className="field-input mt-1" /></label>
        <label className="text-xs font-semibold text-ink-600">To<input type="date" name="to" defaultValue={sp.to ?? ""} className="field-input mt-1" /></label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button className="btn-primary btn-sm">Show</button>
          <Link href={base} className="btn-secondary btn-sm">Clear</Link>
        </div>
      </form>
      <div className="mb-3"><DownloadReport kind="contacts" params={keep} label="Download contacts" /></div>
      <p className="mb-2 text-sm text-ink-600">{num(data.total)} contacts</p>
      <ContactList data={data} base={base} keep={keep} showCollector />

      <div className="mt-5">
        <Section icon="🎪" title="Outreach events" hint={`${events.length} events volunteers can pick`}>
          <EventForm dhams={u.role === "admin" ? dhams : undefined} />
          {events.length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{events.map((e) => <li key={e.id} className="rounded-full bg-stone-100 px-2.5 py-1 text-sm">{e.name}</li>)}</ul>}
        </Section>
      </div>
      <Card className="mt-3" title="Privacy">
        <p className="text-sm text-ink-600">Only people who agreed are contacted, and only about what they chose. Volunteers see only their own records; Sector Sevaks see their Dham; downloads are logged.</p>
      </Card>
    </>
  );
}

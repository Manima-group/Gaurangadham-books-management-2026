import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApproved } from "@/lib/session";
import { AGE_GROUPS, canDeleteContact, canManageContacts, canSeeContact, DUP_LABEL, INTEREST_LABEL, INTERESTS } from "@/lib/outreach";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DeleteButton } from "@/components/delete";
import { deleteContact, reviewDuplicate } from "@/app/actions/outreach";
import { ContactForm } from "../form";
import { eventsFor } from "../data";

/** One contact: details, consent, who collected it, duplicate review, corrections and deletion. */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireApproved("contact", "devotee", "manager", "admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [c] = await db.select().from(schema.outreachContact).where(eq(schema.outreachContact.id, id));
  if (!c || !canSeeContact(u, c)) notFound();
  const [interests, [collector], events, auditRows] = await Promise.all([
    db.select().from(schema.outreachContactInterest).where(eq(schema.outreachContactInterest.contactId, id)),
    db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, c.collectorId)),
    eventsFor(u),
    canManageContacts(u) ? db.select({ action: schema.outreachContactAudit.action, at: schema.outreachContactAudit.at, name: schema.user.name })
      .from(schema.outreachContactAudit).leftJoin(schema.user, eq(schema.user.id, schema.outreachContactAudit.userId))
      .where(eq(schema.outreachContactAudit.contactId, id)).orderBy(asc(schema.outreachContactAudit.at)) : Promise.resolve([]),
  ]);
  // The earlier record with the same number is shown only if this person may see it.
  const [other] = c.duplicateOf ? await db.select().from(schema.outreachContact).where(eq(schema.outreachContact.id, c.duplicateOf)) : [];
  const dup = DUP_LABEL[c.dupStatus];
  const collectorOnly = u.role === "contact" || u.role === "devotee";
  const back = collectorOnly ? "/contacts/mine" : "/contacts";
  return (
    <>
      <PageHeader
        title={c.fullName}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: collectorOnly ? "My Contacts" : "Outreach Contacts", href: back }, { label: c.fullName }]}
        doHere="Correct the details if something was typed wrongly. Consent and who collected the contact are kept automatically."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={c.consent ? "green" : "red"}>{c.consent ? `Consent given ${fmtDateTime(c.consentAt)}` : "No consent"}</Badge>
        <Badge tone={dup.tone}>{dup.label}</Badge>
        <Badge>Collected by {collector?.name ?? "—"} · {fmtDateTime(c.collectedAt)}</Badge>
        {interests.map((i) => <Badge key={i.interest} tone="blue">{INTEREST_LABEL[i.interest] ?? i.interest}</Badge>)}
      </div>

      {c.dupStatus === "possible" && canManageContacts(u) && (
        <Card className="mb-4" title="Possible duplicate">
          <p className="text-sm text-ink-700">
            This mobile number was already on file
            {other && canSeeContact(u, other) ? <> as <a href={`/contacts/${other.id}`} className="font-semibold text-brand-700 underline">{other.fullName}</a> ({fmtDateTime(other.collectedAt)})</> : " (a record in another Dham)"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={reviewDuplicate}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="duplicate" /><button className="btn-secondary btn-sm">Mark as duplicate</button></form>
            <form action={reviewDuplicate}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="not_duplicate" /><button className="btn-secondary btn-sm">Not a duplicate</button></form>
          </div>
        </Card>
      )}

      <Card title="Details">
        <ContactForm
          edit interests={INTERESTS} ageGroups={AGE_GROUPS} events={events}
          values={{ ...c, interests: interests.map((i) => i.interest) }}
        />
      </Card>

      {canDeleteContact(u, c) && (
        <div className="mt-4">
          <DeleteButton action={deleteContact} id={c.id} label="Delete contact" confirm="Delete this contact for good?" after={back} />
        </div>
      )}
      {auditRows.length > 0 && (
        <Card className="mt-4" title="Record history">
          <ul className="space-y-1 text-sm text-ink-700">{auditRows.map((a, i) => <li key={i}>{a.action} — {a.name ?? "—"}, {fmtDateTime(a.at)}</li>)}</ul>
        </Card>
      )}
    </>
  );
}

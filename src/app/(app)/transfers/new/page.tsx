import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { sources } from "@/lib/transfers";
import { Alert, Card, PageHeader } from "@/components/ui";
import { RequestForm } from "../forms";

/**
 * Request Books. Who sees which sources:
 *  - Chakra Sevak: every Dham shelf and devotee.
 *  - Sector Sevak: every Dham shelf and their own devotees; other Dhams' devotees only with Book Availability access.
 *  - Devotee: only with Book Availability access (given by a Chakra Sevak) — every shelf and devotee; books come to themself.
 */
export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const u = await requireUser("admin", "manager", "devotee");
  const sp = await searchParams;
  const header = (
    <PageHeader
      title="Request Books"
      crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Books Transfer", href: "/transfers" }, { label: "Request Books" }]}
      doHere="Search the book, choose a Dham shelf or a devotee who has free copies, and enter how many you need. Copies already reserved for other transfers are not shown."
      next="Whoever has the books approves — a devotee for their own books, the Sector Sevak for a Dham shelf. The copies are then reserved, they send them, and the receiver confirms what arrived. Stock changes only when books are sent and received."
    />
  );
  if (u.role === "devotee" && !u.canSeeAvailability)
    return (
      <>
        {header}
        <Alert tone="amber" title="Requesting books is not turned on for you.">
          Ask your Chakra Sevak to give you Book Availability access. Your Sector Sevak can also request books for you.{" "}
          <Link href="/transfers" className="font-semibold underline">Back to Books Transfer</Link>
        </Alert>
      </>
    );

  const all = await sources();
  const visible = all.filter((s) => {
    if (u.role === "admin" || s.kind === "dham") return true;
    if (u.role === "manager") return u.canSeeAvailability || s.dhamId === u.dhamId;
    return s.holder !== `devotee:${u.id}`; // eligible devotee
  });

  let dests: { holder: string; label: string }[] | undefined;
  let defaultDest: string | undefined;
  if (u.role === "devotee") defaultDest = `devotee:${u.id}`;
  else {
    const dhams = await db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham)
      .where(u.role === "admin" ? eq(schema.dham.isActive, true) : eq(schema.dham.id, u.dhamId ?? -1)).orderBy(schema.dham.name);
    const people = await db.select({ id: schema.user.id, name: schema.user.name, dhamId: schema.user.dhamId }).from(schema.user)
      .where(and(eq(schema.user.isActive, true), inArray(schema.user.role, ["devotee"]),
        // only devotees who may receive books (approved, Book Distribution on)
        eq(schema.user.approvalStatus, "approved"), eq(schema.user.canDistributeBooks, true),
        u.role === "admin" ? undefined : eq(schema.user.dhamId, u.dhamId ?? -1)))
      .orderBy(schema.user.name);
    const dn = new Map(dhams.map((d) => [d.id, d.name]));
    dests = [
      ...dhams.map((d) => ({ holder: `dham:${d.id}`, label: `🛕 ${d.name} — shelf` })),
      ...people.filter((p) => p.dhamId && dn.has(p.dhamId)).map((p) => ({ holder: `devotee:${p.id}`, label: `🙋 ${p.name} (${dn.get(p.dhamId!)})` })),
    ];
    defaultDest = u.role === "manager" ? `dham:${u.dhamId}` : undefined;
  }

  return (
    <>
      {header}
      <Card>
        <RequestForm sources={visible} dests={dests} defaultDest={defaultDest} presetBook={sp.book ? Number(sp.book) : undefined} />
      </Card>
    </>
  );
}

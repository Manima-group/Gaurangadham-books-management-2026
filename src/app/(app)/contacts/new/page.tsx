import { requireUser } from "@/lib/session";
import { AGE_GROUPS, INTERESTS } from "@/lib/outreach";
import { Card, PageHeader } from "@/components/ui";
import { ContactForm } from "../form";
import { eventsFor } from "../data";

/** Add a person who wants to hear about spiritual activities. Quick to fill on a phone. */
export default async function NewContactPage() {
  const u = await requireUser("contact", "devotee", "manager", "admin");
  const events = await eventsFor(u);
  return (
    <>
      <PageHeader
        title="Add Contact"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Add Contact" }]}
        doHere="Choose what they are interested in, then their name, mobile number and area. Tick the box only if they agreed to be contacted."
        next="The contact is saved under your name. Your Sector Sevak invites them to the activities they chose."
      />
      <Card>
        <ContactForm interests={INTERESTS} ageGroups={AGE_GROUPS} events={events} />
      </Card>
    </>
  );
}

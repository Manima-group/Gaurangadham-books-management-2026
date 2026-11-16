import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { assertDhamAccess, devoteeInDham, dhamOverview } from "@/lib/hierarchy";
import { DevoteeProfile, type ProfileSP } from "@/components/devotee-profile";
import { withQuery } from "@/components/tabs";

/** Level 3 — one devotee of a Dham. Admin: any Dham. Manager: own Dham only (checked on the server). */
export default async function DevoteeDetail({ params, searchParams }: { params: Promise<{ id: string; uid: string }>; searchParams: Promise<ProfileSP> }) {
  const u = await requireUser("admin", "manager");
  const { id: rawId, uid } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  assertDhamAccess(u, id);
  const [devotee, [dham]] = await Promise.all([devoteeInDham(uid, id), dhamOverview(id)]);
  if (!devotee || !dham) notFound();
  const sp = await searchParams;
  // "ret" holds the devotee list's search / sort / page, so Back returns to the same list.
  const list = sp.ret && /^[\w=&%.+-]*$/.test(sp.ret) ? `/dham/${id}?${sp.ret}` : `/dham/${id}`;
  const crumbs =
    u.role === "admin"
      ? [{ label: "Global Admin", href: "/dashboard" }, { label: "Dhams", href: "/dham" }, { label: dham.name, href: `/dham/${id}` }, { label: "Devotees", href: list }, { label: devotee.name }]
      : [{ label: "Dham Manager", href: "/dashboard" }, { label: "My Dham", href: `/dham/${id}` }, { label: "Devotees", href: list }, { label: devotee.name }];
  return (
    <DevoteeProfile
      devotee={devotee}
      base={withQuery(`/dham/${id}/devotee/${uid}`, {})}
      crumbs={crumbs}
      sp={sp}
      canOpenReports
      backHref={list}
    />
  );
}

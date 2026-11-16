import { requireUser } from "@/lib/session";
import { DevoteeProfile, type ProfileSP } from "@/components/devotee-profile";

/** The devotee's own books, sales and history — only ever their own id. */
export default async function MyHistory({ searchParams }: { searchParams: Promise<ProfileSP> }) {
  const u = await requireUser("devotee", "manager");
  const sp = await searchParams;
  return (
    <DevoteeProfile
      devotee={{ id: u.id, name: u.name, phone: null }}
      title="My Books, Sales & History"
      base="/my/history"
      crumbs={[{ label: "Home", href: "/dashboard" }, { label: "My Books", href: "/my/books" }, { label: "Sales & History" }]}
      sp={{ ...sp, ret: undefined }}
      canOpenReports={false}
    />
  );
}

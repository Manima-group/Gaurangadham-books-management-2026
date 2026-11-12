import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/terms";
import { logoutAction } from "@/app/actions/auth";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "./form";

export default async function AccountPage() {
  const u = await requireUser();
  return (
    <>
      <PageHeader title="My Account" crumbs={[{ label: "Home", href: "/dashboard" }, { label: "My Account" }]} doHere="See your details and change your password." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="My details">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-ink-500">Name</dt><dd className="font-semibold">{u.name}</dd></div>
            <div><dt className="text-ink-500">Role</dt><dd className="font-semibold">{ROLE_LABEL[u.role]}</dd></div>
            <div><dt className="text-ink-500">Dham</dt><dd className="font-semibold">{u.dhamName ?? (u.role === "admin" ? "All Dhams" : "—")}</dd></div>
            <div><dt className="text-ink-500">Mobile number (for login)</dt><dd className="font-semibold">{u.phone ?? "—"}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-ink-500">To change these details, contact your {u.role === "devotee" ? "Dham Manager" : "Admin"}.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/welcome?again=1" className="btn-secondary btn-sm">🧭 Show the guided tour again</Link>
            <a href="/dashboard?intro=1" className="btn-secondary btn-sm">🎬 Play the intro again</a>
            <form action={logoutAction}><button className="btn-secondary btn-sm text-red-700">Log out</button></form>
          </div>
        </Card>
        <Card title="Change password"><PasswordForm /></Card>
      </div>
    </>
  );
}

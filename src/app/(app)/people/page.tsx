import Link from "next/link";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { activeDhams, allDhams } from "@/lib/lookups";
import { togglePerson } from "@/app/actions/setup";
import { ROLE_LABEL, type Role } from "@/lib/terms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { EditPersonForm, PersonForm, ResetPasswordForm } from "./forms";
import { DeleteButton } from "@/components/delete";
import { deletePerson } from "@/app/actions/setup";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ role?: string; dham?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const isAdmin = u.role === "admin";
  const role = (isAdmin ? (["manager", "devotee", "admin"].includes(sp.role ?? "") ? sp.role : "devotee") : "devotee") as Role;
  const c: SQL[] = [eq(schema.user.role, role)];
  if (!isAdmin) c.push(eq(schema.user.dhamId, u.dhamId!));
  else if (sp.dham) c.push(eq(schema.user.dhamId, Number(sp.dham)));
  const [people, dhams, all] = await Promise.all([
    db.select().from(schema.user).where(and(...c)).orderBy(asc(schema.user.name)),
    activeDhams(),
    allDhams(),
  ]);
  const dn = new Map(all.map((d) => [d.id, d.name]));
  const label = { manager: "Dham Managers", devotee: "Devotees", admin: "Global Admins" }[role];

  return (
    <>
      <PageHeader
        title={isAdmin ? "Managers & Devotees" : "My Devotees"}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: isAdmin ? "Settings" : "More" }, { label: isAdmin ? "Managers & Devotees" : "My Devotees" }]}
        doHere={isAdmin ? "Add the people who use the app and choose their role and Dham." : `Add devotees of ${u.dhamName} and help them if they forget their password.`}
        next="They can log in with their mobile number and the password you set. A short tour guides them on first login."
      />
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(["devotee", "manager", "admin"] as const).map((r) => (
            <Link key={r} href={`/people?role=${r}`} className={`btn-sm ${role === r ? "btn-primary" : "btn-secondary"}`}>{ROLE_LABEL[r]}s</Link>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title={`Add a ${role === "manager" ? "Dham Manager" : role === "admin" ? "Global Admin" : "Devotee"}`} className="lg:col-span-2 lg:self-start">
          {isAdmin && dhams.length === 0 && role !== "admin" ? (
            <EmptyState icon="🛕" title="Add a Dham first." action={<Link href="/dhams" className="btn-primary btn-sm">Add a Dham</Link>}>Managers and devotees belong to a Dham.</EmptyState>
          ) : (
            <PersonForm key={role} role={role} dhams={dhams.map((d) => ({ id: d.id, name: d.name }))} isAdmin={isAdmin} />
          )}
        </Card>
        <Card title={`${label} (${people.length})`} className="lg:col-span-3" actions={isAdmin && role !== "admin" ? (
          <form action="/people" className="flex gap-2">
            <input type="hidden" name="role" value={role} />
            <select name="dham" defaultValue={sp.dham ?? ""} className="field-input py-2 text-sm" aria-label="Filter by Dham">
              <option value="">All Dhams</option>
              {all.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn-secondary btn-sm">Filter</button>
          </form>
        ) : undefined}>
          {people.length === 0 ? (
            <EmptyState icon="🙋" title={`No ${label.toLowerCase()} yet.`}>Add one using the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {people.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.name} {p.isActive ? null : <Badge>Inactive</Badge>}</p>
                      <p className="text-sm text-ink-500">
                        📱 {p.phone ?? "—"}{p.dhamId ? ` · ${dn.get(p.dhamId)}` : ""}{p.email.endsWith(".local") ? "" : ` · ${p.email}`}
                      </p>
                    </div>
                    {p.id !== u.id && (
                      <form action={togglePerson}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-secondary btn-sm">{p.isActive ? "Mark as Inactive" : "Mark as Active"}</button>
                      </form>
                    )}
                  </div>
                  {p.id !== u.id && (
                    <details className="mt-2">
                      <summary className="tap cursor-pointer text-sm font-semibold text-brand-700">Edit · reset password · delete</summary>
                      <div className="mt-2 space-y-4 rounded-xl bg-stone-50 p-3">
                        <EditPersonForm p={p} dhams={all.map((d) => ({ id: d.id, name: d.name }))} isAdmin={isAdmin} />
                        <div className="border-t border-stone-200 pt-3">
                          <p className="mb-1.5 text-sm font-semibold">Forgot password? Set a new one</p>
                          <ResetPasswordForm id={p.id} />
                        </div>
                        <div className="border-t border-stone-200 pt-3">
                          <DeleteButton action={deletePerson} id={p.id} label="Delete account" confirm={`Delete ${p.name}'s account?`} />
                        </div>
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

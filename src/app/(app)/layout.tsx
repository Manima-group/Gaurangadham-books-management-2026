import Link from "next/link";
import { after } from "next/server";
import { maybeCheckpoint } from "@/lib/stock";
import { and, count, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { db, schema } from "@/db";
import { NAV } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/terms";
import { BottomNav, MobileMenu, SideNav } from "@/components/nav";
import { logoutAction } from "@/app/actions/auth";
import { APP_NAME, APP_TAGLINE, MANIMA_LOGO_LIGHT_SVG, MANIMA_NAME, MANIMA_URL } from "@/lib/brand";
import { BrandMark } from "@/components/brandmark";
import { OfflineSync } from "@/components/pwa";
import { NavLoader } from "@/components/navloader";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const items = NAV[u.role];
  const [[{ unread }], [org]] = await Promise.all([
    db
      .select({ unread: count() })
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, u.id), eq(schema.notification.isRead, false))),
    db.select().from(schema.organization).limit(1),
  ]);
  // After the page is sent: save a stock checkpoint if one is due (never slows the page).
  after(() => maybeCheckpoint().catch(() => {}));
  const place = u.role === "admin" ? "All Dhams" : u.dhamName ?? "No Dham assigned";

  const account = (
    <div className="mt-6 space-y-0.5 border-t border-white/10 pt-4">
      <Link href="/account" className="block rounded-xl px-3 py-2 text-sm text-blue-100/80 hover:bg-white/[0.07] hover:text-white">
        🔑 My Account &amp; Password
      </Link>
      <Link href="/welcome?again=1" className="block rounded-xl px-3 py-2 text-sm text-blue-100/80 hover:bg-white/[0.07] hover:text-white">
        🧭 Show the guided tour again
      </Link>
      <form action={logoutAction}>
        <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200">⎋ Log out</button>
      </form>
    </div>
  );

  const credit = (
    <a href={MANIMA_URL} target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10 transition hover:bg-white/[0.08]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MANIMA_LOGO_LIGHT_SVG} alt="" className="h-9 w-12 shrink-0 object-contain drop-shadow-[0_0_6px_rgb(253_177_116/0.45)]" />
      <span className="leading-tight">
        <span className="block text-[10px] uppercase tracking-[0.18em] text-blue-200/60">Developed by</span>
        <span className="block text-xs font-semibold text-white/90">{MANIMA_NAME}</span>
      </span>
    </a>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-gradient-to-b from-navy-900 via-navy-900 to-navy-950 px-3 py-5 text-white lg:flex">
        <Link href="/dashboard" className="mb-7 flex items-center gap-3 px-2">
          <BrandMark size={48} />
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-[16px] font-bold text-white">{APP_NAME}</span>
            <span className="block text-xs text-brand-200/80">{APP_TAGLINE}</span>
          </span>
        </Link>
        <div className="flex-1">
          <SideNav items={items} />
          {account}
        </div>
        {credit}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200/70 bg-white/80 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {u.role !== "devotee" && <MobileMenu items={items}>{account}{credit}</MobileMenu>}
            <BrandMark size={36} className="lg:hidden" />
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-bold text-ink-900">Hare Krishna, {u.name.split(" ")[0]} 🙏</p>
              <p className="truncate text-xs font-medium text-ink-500">
                {ROLE_LABEL[u.role]} · {place}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-lg shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              🔔
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            {u.role === "devotee" && (
              <Link href="/account" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-lg" aria-label="My account">
                👤
              </Link>
            )}
          </div>
        </header>
        <OfflineSync userId={u.id} role={u.role} />
        <main className="mx-auto w-full max-w-6xl flex-1 animate-fade-up px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
          <NavLoader>{children}</NavLoader>
        </main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}

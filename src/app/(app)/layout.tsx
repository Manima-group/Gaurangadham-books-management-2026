import Link from "next/link";
import { after } from "next/server";
import { maybeCheckpoint } from "@/lib/stock";
import { and, count, eq } from "drizzle-orm";
import { requireSignedIn } from "@/lib/session";
import { db, schema } from "@/db";
import { navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/terms";
import { BottomNav, DesktopSidebar, MobileMenu } from "@/components/nav";
import { logoutAction } from "@/app/actions/auth";
import { APP_NAME, APP_TAGLINE, MANIMA_LOGO_LIGHT_SVG, MANIMA_NAME, MANIMA_URL } from "@/lib/brand";
import { BrandMark } from "@/components/brandmark";
import { OfflineSync } from "@/components/pwa";
import { NavLoader } from "@/components/navloader";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireSignedIn();
  const items = navFor(u);
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
    <div className="mt-4 space-y-0.5 border-t border-white/10 pt-3">
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
    <div className="app-shell min-h-dvh lg:grid">
      <DesktopSidebar
        items={items}
        brand={
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 px-1">
            <BrandMark size={40} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[15px] font-bold text-white">{APP_NAME}</span>
              <span className="block truncate text-[11px] text-brand-200/80">{APP_TAGLINE}</span>
            </span>
          </Link>
        }
        brandSmall={
          <Link href="/dashboard" aria-label={APP_NAME}>
            <BrandMark size={36} />
          </Link>
        }
        footer={<>{account}{credit}</>}
      />

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-stone-200/80 bg-white/90 px-3 py-2 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileMenu items={items}>{account}{credit}</MobileMenu>
            <BrandMark size={34} className="hidden min-[360px]:block lg:hidden" />
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-bold text-ink-900">Hare Krishna, {u.name.split(" ")[0]} 🙏</p>
              <p className="truncate text-xs font-medium text-ink-500">
                {ROLE_LABEL[u.role]}{u.isCoSevak ? " (Co-Sevak 🛠)" : ""} · {place}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-lg shadow-sm transition hover:bg-stone-50"
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
        <main className="mx-auto w-full max-w-[1240px] flex-1 animate-fade-up px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12">
          <NavLoader>{children}</NavLoader>
        </main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}

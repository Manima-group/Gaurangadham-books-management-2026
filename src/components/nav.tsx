"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NavItem } from "@/lib/nav";

function matches(path: string, href: string) {
  if (href === "/dashboard") return path === "/dashboard";
  if (href === "/stock") return path === "/stock" || (path.startsWith("/stock/") && !path.startsWith("/stock/assign-devotees"));
  return path === href || path.startsWith(href + "/");
}
/** Only the most specific matching item is active (e.g. Outreach Reports, not also Outreach Contacts). */
function activeHref(path: string, items: NavItem[]) {
  return items.filter((i) => matches(path, i.href)).sort((a, z) => z.href.length - a.href.length)[0]?.href;
}
const isActive = (path: string, href: string, items?: NavItem[]) => (items ? activeHref(path, items) === href : matches(path, href));

function groupItems(items: NavItem[]) {
  const groups = new Map<string, NavItem[]>();
  for (const it of items) {
    const g = it.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(it);
  }
  return [...groups.entries()];
}

export type Badges = Record<string, number>;

function Count({ n, active }: { n?: number; active?: boolean }) {
  if (!n) return null;
  return (
    <span className={`ml-auto min-w-6 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-bold tabular-nums ${active ? "bg-white text-brand-700" : "bg-red-100 text-red-700"}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function NavLink({ it, active, compact, badge }: { it: NavItem; active: boolean; compact?: boolean; badge?: number }) {
  return (
    <Link
      href={it.href}
      aria-current={active ? "page" : undefined}
      title={compact ? it.label : undefined}
      className={`group relative flex items-center gap-3 rounded-xl border-2 text-[14.5px] transition ${compact ? "justify-center px-0 py-1.5" : "px-2.5 py-2"} ${
        active
          ? "border-brand-700 bg-brand-500 font-bold text-white shadow-[0_6px_16px_-8px_rgb(217_85_18/0.9)]"
          : "border-transparent font-medium text-ink-800 hover:border-stone-200 hover:bg-stone-50"
      }`}
    >
      <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[17px] ${active ? "bg-white/25" : "bg-stone-100 group-hover:bg-white"}`}>
        {it.icon}
      </span>
      {compact ? (
        <>
          <span className="sr-only">{it.label}</span>
          {!!badge && <span className="absolute right-1 top-0.5 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" aria-hidden />}
        </>
      ) : (
        <>
          <span className="min-w-0 truncate">{it.label}</span>
          <Count n={badge} active={active} />
        </>
      )}
    </Link>
  );
}

/** Main menu: every item always visible, grouped under small headings; the current page is filled saffron. */
export function SideNav({ items, compact, badges = {} }: { items: NavItem[]; compact?: boolean; badges?: Badges }) {
  const path = usePathname();
  const current = activeHref(path, items);
  const groups = groupItems(items);
  const links = (list: NavItem[]) => (
    <ul className="space-y-1">
      {list.map((it) => (
        <li key={it.href}>
          <NavLink it={it} active={current === it.href} compact={compact} badge={badges[it.href]} />
        </li>
      ))}
    </ul>
  );
  if (compact)
    return (
      <nav aria-label="Main menu" className="space-y-1">
        {groups.map(([g, list], i) => <div key={g || "main"} className={i ? "border-t border-stone-200 pt-2" : ""}>{links(list)}</div>)}
      </nav>
    );
  return (
    <nav aria-label="Main menu" className="space-y-1.5">
      {groups.map(([g, list]) =>
        g ? (
          <NavGroup
            key={g}
            title={g}
            holdsCurrent={list.some((it) => it.href === current)}
            waiting={list.reduce((a, it) => a + (badges[it.href] ?? 0), 0)}
          >
            {links(list)}
          </NavGroup>
        ) : (
          <div key="main" className="pb-1">{links(list)}</div>
        ),
      )}
    </nav>
  );
}

/**
 * A menu section that folds open/closed with one tap on its heading. Open by default; a folded
 * section stays folded on this device. The section holding the current page always opens, and a
 * folded section still shows how many things are waiting inside it.
 */
function NavGroup({ title, holdsCurrent, waiting, children }: { title: string; holdsCurrent: boolean; waiting: number; children: React.ReactNode }) {
  const key = `gb-nav-${title}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (holdsCurrent) return setOpen(true);
    try { setOpen(localStorage.getItem(key) !== "0"); } catch {}
  }, [key, holdsCurrent]);
  const toggle = () =>
    setOpen((o) => {
      try { localStorage.setItem(key, o ? "0" : "1"); } catch {}
      return !o;
    });
  const id = `nav-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="border-t border-stone-100 pt-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500 transition hover:bg-stone-50 hover:text-ink-900"
      >
        <span className="flex-1">{title}</span>
        {!open && waiting > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-red-700">{waiting}</span>}
        <span aria-hidden className={`text-xs transition-transform ${open ? "rotate-0" : "-rotate-90"}`}>▾</span>
      </button>
      <div id={id} hidden={!open} className="pt-1">{children}</div>
    </div>
  );
}

/** Desktop sidebar that can fold down to an icon rail. The choice is remembered on this device. */
export function DesktopSidebar({ items, brand, brandSmall, footer, badges }: { items: NavItem[]; brand: React.ReactNode; brandSmall: React.ReactNode; footer: React.ReactNode; badges?: Badges }) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try { setCompact(localStorage.getItem("gb-sidebar") === "compact"); } catch {}
  }, []);
  const toggle = () => {
    setCompact((c) => {
      try { localStorage.setItem("gb-sidebar", c ? "full" : "compact"); } catch {}
      return !c;
    });
  };
  return (
    <aside className={`sticky top-0 hidden h-dvh flex-col overflow-y-auto overflow-x-hidden border-r border-stone-200 bg-white py-4 lg:flex ${compact ? "w-[4.75rem] px-2" : "w-[16.5rem] px-3"}`}>
      <div className={`mb-5 flex items-center ${compact ? "flex-col gap-3" : "justify-between gap-2"}`}>
        {compact ? brandSmall : brand}
        <button
          type="button"
          onClick={toggle}
          aria-label={compact ? "Expand menu" : "Collapse menu"}
          title={compact ? "Expand menu" : "Collapse menu"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-ink-500 transition hover:bg-stone-50 hover:text-ink-900"
        >
          <span aria-hidden className="text-sm">{compact ? "»" : "«"}</span>
        </button>
      </div>
      <div className="flex-1">
        <SideNav items={items} compact={compact} badges={badges} />
      </div>
      {!compact && footer}
    </aside>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const list = items.filter((i) => i.mobile).slice(0, 5);
  return (
    <nav aria-label="Quick menu" className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(15_29_58/0.25)] backdrop-blur lg:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0,1fr))` }}>
        {list.map((it) => {
          const active = isActive(path, it.href, items);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition ${
                  active ? "text-brand-700" : "text-ink-500"
                }`}
              >
                <span aria-hidden className={`flex h-8 w-12 items-center justify-center rounded-full text-xl transition ${active ? "bg-brand-100" : "opacity-75"}`}>{it.icon}</span>
                <span className="max-w-full truncate">{it.short ?? it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileMenu({ items, children, badges }: { items: NavItem[]; children?: React.ReactNode; badges?: Badges }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const path = usePathname();
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The drawer is rendered into <body> (portal). The sticky header uses backdrop-filter,
  // which would otherwise trap a position:fixed drawer inside the header's 50px height.
  const drawer = (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="absolute inset-y-0 left-0 flex w-80 max-w-[86%] flex-col overflow-y-auto bg-white p-4 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <span className="font-display text-lg font-bold text-ink-900">Menu</span>
          <button
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-ink-700 hover:bg-stone-50"
            onClick={() => setOpen(false)}
          >
            Close ✕
          </button>
        </div>
        <SideNav items={items} badges={badges} />
        {children}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-ink-800 shadow-sm transition hover:bg-stone-50 lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <span aria-hidden className="text-lg leading-none">☰</span>
      </button>
      {open && mounted && createPortal(drawer, document.body)}
    </>
  );
}

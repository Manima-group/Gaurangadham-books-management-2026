"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NavItem } from "@/lib/nav";

function isActive(path: string, href: string) {
  if (href === "/dashboard") return path === "/dashboard";
  if (href === "/stock") return path === "/stock" || (path.startsWith("/stock/") && !path.startsWith("/stock/assign-devotees"));
  return path === href || path.startsWith(href + "/");
}

function groupItems(items: NavItem[]) {
  const groups = new Map<string, NavItem[]>();
  for (const it of items) {
    const g = it.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(it);
  }
  return [...groups.entries()];
}

function NavLink({ it, active, compact }: { it: NavItem; active: boolean; compact?: boolean }) {
  return (
    <Link
      href={it.href}
      aria-current={active ? "page" : undefined}
      title={compact ? it.label : undefined}
      className={`group flex items-center gap-3 rounded-xl text-[14.5px] font-medium transition ${compact ? "justify-center px-0 py-1.5" : "px-2.5 py-2"} ${
        active ? "bg-white/[0.12] text-white" : "text-blue-100/75 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base transition ${active ? "bg-brand-500 shadow-[0_4px_12px_-4px_rgb(242_107_29/0.9)]" : "bg-white/[0.05] group-hover:bg-white/10"}`}
      >
        {it.icon}
      </span>
      {compact ? <span className="sr-only">{it.label}</span> : <span className="min-w-0 truncate">{it.label}</span>}
      {active && !compact && <span aria-hidden className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
    </Link>
  );
}

/** Main menu. Sections fold open/closed; the section holding the current page is always open. */
export function SideNav({ items, compact }: { items: NavItem[]; compact?: boolean }) {
  const path = usePathname();
  const groups = groupItems(items);
  if (compact)
    return (
      <nav aria-label="Main menu" className="space-y-1">
        {groups.map(([g, list], i) => (
          <ul key={g} className={`space-y-1 ${i ? "border-t border-white/10 pt-2" : ""}`}>
            {list.map((it) => <li key={it.href}><NavLink it={it} active={isActive(path, it.href)} compact /></li>)}
          </ul>
        ))}
      </nav>
    );
  return (
    <nav aria-label="Main menu" className="space-y-2">
      {groups.map(([g, list]) => {
        const links = (
          <ul className="space-y-0.5">
            {list.map((it) => <li key={it.href}><NavLink it={it} active={isActive(path, it.href)} /></li>)}
          </ul>
        );
        if (!g) return <div key="main">{links}</div>;
        const hasActive = list.some((it) => isActive(path, it.href));
        return <NavGroup key={g + (hasActive ? ":a" : "")} title={g} open={hasActive}>{links}</NavGroup>;
      })}
    </nav>
  );
}

function NavGroup({ title, open, children }: { title: string; open: boolean; children: React.ReactNode }) {
  const key = `gb-nav-${title}`;
  // Open by default; a section the person folded stays folded (unless it holds the current page).
  const [isOpen, setOpen] = useState(true);
  useEffect(() => {
    if (open) return setOpen(true);
    try {
      setOpen(localStorage.getItem(key) !== "0");
    } catch {}
  }, [key, open]);
  return (
    <details
      open={isOpen}
      onToggle={(e) => {
        const o = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(o);
        try { localStorage.setItem(key, o ? "1" : "0"); } catch {}
      }}
      className="group/g border-t border-white/[0.08] pt-2 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200/55 transition hover:text-blue-100">
        {title}
        <span aria-hidden className="text-xs transition group-open/g:rotate-180">▾</span>
      </summary>
      <div className="pt-1">{children}</div>
    </details>
  );
}

/** Desktop sidebar that can fold down to an icon rail. The choice is remembered on this device. */
export function DesktopSidebar({ items, brand, brandSmall, footer }: { items: NavItem[]; brand: React.ReactNode; brandSmall: React.ReactNode; footer: React.ReactNode }) {
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
    <aside className={`sticky top-0 hidden h-dvh flex-col overflow-y-auto overflow-x-hidden bg-navy-900 py-4 text-white lg:flex ${compact ? "w-[4.75rem] px-2" : "w-[16.5rem] px-3"}`}>
      <div className={`mb-5 flex items-center ${compact ? "flex-col gap-3" : "justify-between gap-2"}`}>
        {compact ? brandSmall : brand}
        <button
          type="button"
          onClick={toggle}
          aria-label={compact ? "Expand menu" : "Collapse menu"}
          title={compact ? "Expand menu" : "Collapse menu"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-100/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
        >
          <span aria-hidden className="text-sm">{compact ? "»" : "«"}</span>
        </button>
      </div>
      <div className="flex-1">
        <SideNav items={items} compact={compact} />
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
          const active = isActive(path, it.href);
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

export function MobileMenu({ items, children }: { items: NavItem[]; children?: React.ReactNode }) {
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
      <div className="absolute inset-y-0 left-0 flex w-80 max-w-[86%] flex-col overflow-y-auto bg-navy-900 p-4 text-white shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <span className="font-display text-lg font-bold">Menu</span>
          <button
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            Close ✕
          </button>
        </div>
        <SideNav items={items} />
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

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

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const groups = new Map<string, NavItem[]>();
  for (const it of items) {
    const g = it.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(it);
  }
  return (
    <nav aria-label="Main menu" className="space-y-5">
      {[...groups.entries()].map(([g, list]) => (
        <div key={g}>
          {g && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200/50">{g}</p>}
          <ul className="space-y-0.5">
            {list.map((it) => {
              const active = isActive(path, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                      active
                        ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_8px_20px_-8px_rgb(242_107_29/0.8)]"
                        : "text-blue-100/80 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition ${active ? "bg-white/20" : "bg-white/[0.06] group-hover:bg-white/10"}`}>{it.icon}</span>
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
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
      <div className="absolute inset-y-0 left-0 flex w-80 max-w-[86%] flex-col overflow-y-auto bg-gradient-to-b from-navy-900 to-navy-950 p-4 text-white shadow-2xl">
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
        className="btn-secondary btn-sm h-11 shrink-0 whitespace-nowrap px-3 lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <span aria-hidden className="text-lg leading-none">☰</span>
        <span className="hidden min-[400px]:inline">Menu</span>
      </button>
      {open && mounted && createPortal(drawer, document.body)}
    </>
  );
}

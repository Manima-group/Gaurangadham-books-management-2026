"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PageSkeleton } from "@/components/loader";

/**
 * Shows the shimmer page + 3D book the moment a link is tapped, until the new page arrives.
 * (Done here instead of loading.tsx: a Suspense boundary there made page updates after
 * a save get stuck in Next 15.)
 */
export function NavLoader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [target, setTarget] = useState<string | null>(null);

  // New page arrived (or the same page re-rendered at a new address) → hide the loader.
  useEffect(() => setTarget(null), [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname) return; // same page (filters etc.) — no full loader
      setTarget(url.pathname);
    };
    const clear = () => setTarget(null);
    document.addEventListener("click", onClick, true); // capture: Next <Link> cancels the click later
    window.addEventListener("popstate", clear);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", clear);
    };
  }, []);

  // Safety: never leave the loader up (e.g. the link was blocked or failed).
  useEffect(() => {
    if (!target) return;
    const t = setTimeout(() => setTarget(null), 12_000);
    return () => clearTimeout(t);
  }, [target]);

  if (target && target !== pathname) return <PageSkeleton />;
  return <>{children}</>;
}

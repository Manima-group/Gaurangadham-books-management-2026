"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveSalesReport } from "@/app/actions/reports";
import { submitMoney } from "@/app/actions/money";
import {
  QUEUE_EVENT,
  addAttention,
  attention,
  dismissAttention,
  isNetworkError,
  queued,
  removeQueued,
  toFormData,
  type Attention,
  type QueueItem,
} from "@/lib/offline-queue";

/** On the login screen: forget pages saved for whoever was logged in before. */
export function ForgetSavedPages() {
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: "forget" });
  }, []);
  return null;
}

/** Registers the service worker (production only). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

const ACTIONS = { sales: saveSalesReport, money: submitMoney } as const;

/**
 * Shows an offline banner, items waiting to be sent, and sends them automatically when the phone is back online.
 * Only items saved by the person who is logged in are ever sent.
 */
export function OfflineSync({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [att, setAtt] = useState<Attention[]>([]);
  const [sent, setSent] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(() => {
    setItems(queued(userId));
    setAtt(attention());
  }, [userId]);

  const sync = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    let ok = 0;
    try {
      for (const q of queued(userId).sort((a, b) => a.createdAt - b.createdAt)) {
        let res;
        try {
          res = await ACTIONS[q.kind]({ status: "idle" }, toFormData(q));
        } catch (e) {
          if (isNetworkError(e)) break; // still no signal — try again later
          res = { status: "error" as const, message: "This could not be sent.", detail: "Please open it and try again." };
        }
        removeQueued(q.id);
        if (res.status === "success") ok++;
        else addAttention({ id: q.id, label: q.label, message: [res.message, res.detail].filter(Boolean).join(" "), link: q.link });
      }
    } finally {
      busy.current = false;
      refresh();
      if (ok) {
        setSent(`${ok} item${ok > 1 ? "s" : ""} saved offline ${ok > 1 ? "were" : "was"} sent ✅`);
        router.refresh();
      }
    }
  }, [userId, refresh, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const on = () => {
      setOnline(true);
      sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(QUEUE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    sync();
    const t = setInterval(sync, 60_000); // also retry every minute (signal can return without an "online" event)
    // Save the most-used pages on this phone so they open without signal.
    // If a different person used this phone before, forget their saved pages first.
    if ("serviceWorker" in navigator) {
      const urls = role === "devotee" ? ["/dashboard", "/my/sales", "/my/money", "/my/books", "/my/reports"] : ["/dashboard", "/stock", "/reports"];
      navigator.serviceWorker.ready
        .then((reg) => {
          let owner: string | null = null;
          try { owner = localStorage.getItem("gb-sw-owner"); localStorage.setItem("gb-sw-owner", userId); } catch {}
          if (owner && owner !== userId) reg.active?.postMessage({ type: "forget" });
          reg.active?.postMessage({ type: "warm", urls });
        })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(QUEUE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      clearInterval(t);
    };
  }, [refresh, sync, role]);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 6000);
    return () => clearTimeout(t);
  }, [sent]);

  if (online && !items.length && !att.length && !sent) return null;
  return (
    <div className="space-y-2 px-4 pt-3 sm:px-6" aria-live="polite">
      {!online && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <span aria-hidden className="text-lg">📴</span>
          <p>
            <b>You&apos;re offline.</b> You can still enter today&apos;s sales and money — they&apos;ll be sent automatically when you&apos;re back online.
          </p>
        </div>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
          <p>
            📤 <b>{items.length} waiting to send:</b> {items.map((i) => i.label).join(", ")}
          </p>
          {online && (
            <button type="button" onClick={sync} className="btn-secondary btn-sm">
              Send now
            </button>
          )}
        </div>
      )}
      {att.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200">
          <p>
            ⚠ <b>{a.label} was not accepted:</b> {a.message}
          </p>
          <span className="flex gap-2">
            <Link href={a.link} onClick={() => dismissAttention(a.id)} className="btn-secondary btn-sm">
              Open and fix
            </Link>
            <button type="button" onClick={() => dismissAttention(a.id)} className="btn-secondary btn-sm">
              Dismiss
            </button>
          </span>
        </div>
      ))}
      {sent && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200">{sent}</div>}
    </div>
  );
}

/* Client-side queue for things submitted while offline (stored on the phone in localStorage). */
import type { ActionState } from "./action";

export type QueueKind = "sales" | "money";
export type QueueItem = { id: string; kind: QueueKind; userId: string; label: string; link: string; createdAt: number; entries: [string, string][] };
export type Attention = { id: string; label: string; message: string; link: string };

const KEY = "gb-offline-queue";
const ATT = "gb-offline-attention";
export const QUEUE_EVENT = "gb-queue-changed";

const read = <T,>(k: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(k) || "[]");
  } catch {
    return [];
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
  window.dispatchEvent(new Event(QUEUE_EVENT));
};

export const queued = (userId?: string) => read<QueueItem>(KEY).filter((q) => !userId || q.userId === userId);
export const attention = () => read<Attention>(ATT);
export const removeQueued = (id: string) => write(KEY, read<QueueItem>(KEY).filter((q) => q.id !== id));
export const addAttention = (a: Attention) => write(ATT, [...read<Attention>(ATT).filter((x) => x.id !== a.id), a]);
export const dismissAttention = (id: string) => write(ATT, read<Attention>(ATT).filter((x) => x.id !== id));

export function enqueue(kind: QueueKind, userId: string, fd: FormData, label: string, link: string) {
  const entries: [string, string][] = [];
  fd.forEach((v, k) => typeof v === "string" && entries.push([k, v]));
  // One queued item per report date / money entry: a newer save replaces an older one for the same report.
  const id = kind === "sales" ? `sales:${userId}:${fd.get("reportDate")}` : `money:${userId}:${Date.now()}`;
  write(KEY, [...read<QueueItem>(KEY).filter((q) => q.id !== id), { id, kind, userId, label, link, createdAt: Date.now(), entries }]);
}

export const toFormData = (q: QueueItem) => {
  const fd = new FormData();
  for (const [k, v] of q.entries) fd.append(k, v);
  return fd;
};

/** True when the error means "couldn't reach the server" (not a validation problem). */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return e instanceof TypeError || /fetch|network|load failed|connection|timed? ?out/i.test(msg);
}

/**
 * Wraps a server action so that, with no signal, the form is saved on the phone instead of failing.
 */
export function offlineCapable(
  action: (s: ActionState, fd: FormData) => Promise<ActionState>,
  opts: { kind: QueueKind; userId: string; label: (fd: FormData) => string; link: (fd: FormData) => string },
) {
  return async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    const save = (): ActionState => {
      enqueue(opts.kind, opts.userId, fd, opts.label(fd), opts.link(fd));
      return {
        status: "success",
        message: "Saved on your phone 📱",
        detail: "You're offline right now. It will be sent automatically as soon as you're back online — you don't need to do anything.",
        next: { label: "Back to Home", href: "/dashboard" },
        at: Date.now(),
      };
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) return save();
    try {
      return await action(prev, fd);
    } catch (e) {
      if (isNetworkError(e)) return save();
      throw e;
    }
  };
}

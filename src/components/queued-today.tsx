"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QUEUE_EVENT, queued } from "@/lib/offline-queue";

/** Shows `children` normally; if today's report is saved on the phone waiting to send, shows that instead. */
export function QueuedToday({ userId, date, children }: { userId: string; date: string; children: ReactNode }) {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const check = () => setWaiting(queued(userId).some((q) => q.id === `sales:${userId}:${date}`));
    check();
    window.addEventListener(QUEUE_EVENT, check);
    return () => window.removeEventListener(QUEUE_EVENT, check);
  }, [userId, date]);
  if (!waiting) return <>{children}</>;
  return (
    <>
      <p className="mt-1 text-xl font-bold">📱 Today&apos;s report is saved on your phone</p>
      <p className="mt-1 text-white/90">It will be sent to your Manager automatically as soon as you&apos;re back online. You don&apos;t need to do anything.</p>
    </>
  );
}

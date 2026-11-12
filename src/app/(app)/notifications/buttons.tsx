"use client";

import { clearNotifications, deleteNotification } from "@/app/actions/setup";
import { PendingProvider, SubmitButton, useFormAction } from "@/components/client";

export function NotifDelete({ id }: { id: number }) {
  const { onSubmit, pending } = useFormAction(deleteNotification);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={id} />
      <button aria-label="Delete notification" disabled={pending} className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
        ✕
      </button>
    </form>
  );
}

export function ClearAll() {
  const { onSubmit, pending } = useFormAction(clearNotifications);
  return (
    <PendingProvider pending={pending}>
      <form onSubmit={onSubmit}>
        <SubmitButton variant="secondary" size="sm" pending="Clearing…" className="w-full">🗑 Clear all</SubmitButton>
      </form>
    </PendingProvider>
  );
}

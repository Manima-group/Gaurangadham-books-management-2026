"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action";
import { ActionMessage, PendingProvider, SubmitButton, useFormAction } from "./client";

/**
 * Delete with a "Sure?" step — no browser pop-ups. Shows the result (or why it can't be deleted) inline.
 */
export function DeleteButton({
  action,
  id,
  label = "Delete",
  confirm = "Delete this? This can't be undone.",
  size = "sm",
  extra,
  after,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  id: number | string;
  label?: string;
  confirm?: string;
  size?: "sm";
  extra?: Record<string, string>;
  /** Where to go after a successful delete (e.g. the list, when this page's record is gone). */
  after?: string;
}) {
  const [asking, setAsking] = useState(false);
  const { state, onSubmit, pending } = useFormAction(action);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") {
      setAsking(false);
      if (after) router.replace(after);
    }
  }, [state.at, state.status, after, router]);
  return (
    <div className="space-y-2">
      {state.status !== "idle" && <ActionMessage state={state} />}
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} className={`btn-secondary ${size === "sm" ? "btn-sm" : ""} text-red-700 hover:border-red-300 hover:bg-red-50`}>
          🗑 {label}
        </button>
      ) : (
        <PendingProvider pending={pending}>
          <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 ring-1 ring-red-200">
            <input type="hidden" name="id" value={id} />
            {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <span className="text-sm font-semibold text-red-900">{confirm}</span>
            <SubmitButton variant="danger" size="sm" pending="Deleting…">Yes, delete</SubmitButton>
            <button type="button" onClick={() => setAsking(false)} className="btn-secondary btn-sm">Cancel</button>
          </form>
        </PendingProvider>
      )}
    </div>
  );
}

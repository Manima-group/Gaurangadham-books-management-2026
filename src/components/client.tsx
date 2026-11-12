"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";
import { Alert } from "./ui";

const PendingCtx = createContext(false);

/**
 * Like useActionState, but submits via onSubmit so React does NOT clear the form
 * after a validation error — users never have to retype what they entered.
 */
export function useFormAction(action: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, setState] = useState<ActionState>({ status: "idle" } as ActionState);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const last = useRef(state);
  last.current = state;
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return; // ignore double taps
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    busy.current = true;
    setPending(true);
    try {
      const res = await action(last.current, fd);
      setState(res ?? ({ status: "idle" } as ActionState));
    } catch {
      setState({
        status: "error",
        message: "Something went wrong. Please try again.",
        detail: "If this keeps happening, check your internet connection.",
        at: Date.now(),
      } as ActionState);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { state, onSubmit, pending };
}

export function PendingProvider({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <PendingCtx.Provider value={pending}>{children}</PendingCtx.Provider>;
}

export function SubmitButton({
  children,
  pending,
  variant = "primary",
  className = "",
  name,
  value,
  size,
}: {
  children: ReactNode;
  pending?: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "warn";
  className?: string;
  name?: string;
  value?: string;
  size?: "sm";
}) {
  const ctx = useContext(PendingCtx);
  const { pending: fsPending } = useFormStatus();
  const isPending = ctx || fsPending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={isPending}
      className={`btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
    >
      {isPending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pending ?? "Please wait…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ActionMessage({ state }: { state: ActionState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "idle") ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.at, state.status]);
  if (state.status === "idle") return null;
  return (
    <div ref={ref}>
      <Alert tone={state.status === "success" ? "green" : "red"} title={state.message}>
        {state.detail}
        {state.next && (
          <div className="mt-2">
            <Link href={state.next.href} className="font-semibold underline">
              {state.next.label} →
            </Link>
          </div>
        )}
      </Alert>
    </div>
  );
}

/**
 * A form bound to a server action. Shows the confirmation/error message above the fields.
 * `children` can be a function receiving the current state (for field errors).
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = true,
  hideOnSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode | ((s: ActionState) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  hideOnSuccess?: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success" && resetOnSuccess) formRef.current?.reset();
  }, [state.at, state.status, resetOnSuccess]);
  return (
    <div className="space-y-4">
      <ActionMessage state={state} />
      {!(hideOnSuccess && state.status === "success") && (
        <PendingProvider pending={pending}>
          <form ref={formRef} onSubmit={onSubmit} className={className} noValidate>
            {typeof children === "function" ? children(state) : children}
          </form>
        </PendingProvider>
      )}
    </div>
  );
}


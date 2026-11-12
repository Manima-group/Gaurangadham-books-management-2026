"use client";

import { useState } from "react";
import { finishOnboarding } from "@/app/actions/auth";

export type TourStep = { icon: string; title: string; body: string };

export function Tour({ steps, roleTitle }: { steps: TourStep[]; roleTitle: string }) {
  const [i, setI] = useState(0);
  const s = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between text-sm text-ink-500">
        <span>
          Step {i + 1} of {steps.length}
        </span>
        <span>{roleTitle}</span>
      </div>
      <div className="mb-5 h-2 rounded-full bg-stone-100" aria-hidden>
        <div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="min-h-44 text-center" aria-live="polite">
        <div className="text-5xl" aria-hidden>{s.icon}</div>
        <h2 className="mt-3 text-xl font-bold">{s.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-700">{s.body}</p>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" className="btn-secondary" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          ← Back
        </button>
        {last ? (
          <form action={finishOnboarding}>
            <button className="btn-primary w-full">Start using the app →</button>
          </form>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setI(i + 1)}>
            Next →
          </button>
        )}
      </div>
      {!last && (
        <form action={finishOnboarding} className="mt-3 text-center">
          <button className="tap text-sm text-ink-500 underline hover:text-ink-900">Skip the tour</button>
        </form>
      )}
    </div>
  );
}

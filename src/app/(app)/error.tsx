"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="text-5xl" aria-hidden>🙏</span>
      <h1 className="mt-3 text-xl font-bold">Something went wrong on this page</h1>
      <p className="mt-1 text-ink-500">Your data is safe. Please try again. If it keeps happening, tell your Admin what you were doing.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={reset} className="btn-primary">Try Again</button>
        <a href="/dashboard" className="btn-secondary">Go to Home</a>
      </div>
    </div>
  );
}

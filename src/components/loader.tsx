/** 3D book whose pages turn — shown in the middle while a page loads. */
export function BookLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
      <div className="book3d" aria-hidden>
        <div className="book3d-inner">
          <div className="book3d-back" />
          <div className="book3d-page p1" />
          <div className="book3d-page p2" />
          <div className="book3d-page p3" />
          <div className="book3d-cover">
            <span>ॐ</span>
          </div>
        </div>
        <div className="book3d-shadow" />
      </div>
      <p className="text-sm font-semibold text-ink-500">{label}</p>
    </div>
  );
}

/** Grey shimmering blocks in the shape of a page. */
export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-2xl ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="relative">
      <div className="space-y-4 opacity-70">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-28" />)}
        </div>
        <Shimmer className="h-56" />
        <Shimmer className="h-40" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
        <div className="rounded-3xl bg-white/85 px-8 py-6 shadow-lift backdrop-blur">
          <BookLoader />
        </div>
      </div>
    </div>
  );
}

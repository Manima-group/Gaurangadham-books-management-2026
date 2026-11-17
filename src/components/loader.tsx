import { MANIMA_LOGO_SAFFRON, MANIMA_LOGO_SAFFRON_DEPTH, MANIMA_NAME } from "@/lib/brand";

const LAYERS = 6;

/** The Manima emblem, in the app's saffron, turning in 3D (stacked layers give it thickness) — shown while a page loads. */
export function BookLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="logo3d" aria-hidden>
        <div className="logo3d-glow" />
        <div className="logo3d-spin">
          {Array.from({ length: LAYERS }, (_, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={MANIMA_LOGO_SAFFRON_DEPTH} alt="" className="logo3d-layer" style={{ transform: `translateZ(${-(i + 1) * 1.2}px)`, opacity: 1 - i * 0.08 }} />
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MANIMA_LOGO_SAFFRON} alt="" className="logo3d-layer logo3d-face" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MANIMA_LOGO_SAFFRON} alt="" className="logo3d-layer logo3d-back" style={{ transform: `rotateY(180deg) translateZ(${LAYERS * 1.2 + 1}px)` }} />
        </div>
        <div className="logo3d-shadow" />
      </div>
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      <span className="sr-only">{MANIMA_NAME}</span>
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
        <div className="rounded-3xl bg-white/95 px-9 py-6 shadow-lift ring-1 ring-brand-100 backdrop-blur">
          <BookLoader />
        </div>
      </div>
    </div>
  );
}

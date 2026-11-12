import { APP_NAME, PRABHUPADA_IMG } from "@/lib/brand";

/** Srila Prabhupada's portrait in a saffron ring — the app's brand mark. */
export function BrandMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative inline-flex shrink-0 rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 p-[2px] shadow-[0_6px_18px_-6px_rgb(242_107_29/0.8)] ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PRABHUPADA_IMG}
        alt={`Srila Prabhupada — ${APP_NAME}`}
        width={size}
        height={size}
        className="h-full w-full rounded-full object-cover ring-2 ring-white/80"
      />
    </span>
  );
}

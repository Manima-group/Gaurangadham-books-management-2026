import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-static";
export const metadata = { title: `Offline · ${APP_NAME}` };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-b from-navy-900 to-navy-950 p-6 text-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/prabhupada.webp" alt="" className="h-20 w-20 rounded-full ring-4 ring-brand-500/70" />
      <h1 className="font-display text-2xl font-extrabold">You&apos;re offline 📴</h1>
      <p className="max-w-sm text-blue-100/80">
        This page hasn&apos;t been saved on your phone yet. Pages you opened while online — like <b>Today&apos;s Sales</b> — still work offline,
        and anything you submit is sent automatically when you&apos;re back online.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <a href="/my/sales" className="btn-primary">📝 Today&apos;s Sales</a>
        <a href="/dashboard" className="btn-secondary">🏠 Home</a>
      </div>
    </main>
  );
}

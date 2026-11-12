import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="text-5xl" aria-hidden>🔎</span>
      <h1 className="text-2xl font-bold">We couldn't find that page</h1>
      <p className="max-w-md text-ink-500">The link may be old, or the record may belong to another Dham.</p>
      <Link href="/dashboard" className="btn-primary">Go to Home</Link>
    </main>
  );
}

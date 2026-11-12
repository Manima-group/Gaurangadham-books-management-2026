"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_NAME, APP_TAGLINE, MANIMA_LOGO_DEPTH, MANIMA_LOGO_LIGHT, MANIMA_NAME, MANIMA_SITE, PRABHUPADA_IMG } from "@/lib/brand";

const KEY = "gb-intro-seen";
const DURATION = 7800; // ms
const DEPTH_LAYERS = 9; // stacked copies that give the emblem real 3D thickness

/* Deterministic pseudo-random values using integer maths only, so the server (Node) and
   every browser produce exactly the same numbers — no hydration mismatch. */
const rnd = (i: number, salt: number) => (((i + 1) * 7919 + salt * 104729) * 2654435761 % 4294967296 >>> 0) % 10000 / 10000;
const f2 = (n: number) => n.toFixed(2);
const SPARKS = Array.from({ length: 34 }, (_, i) => ({
  left: `${f2(rnd(i, 1) * 100)}%`,
  size: `${f2(2 + rnd(i, 2) * 5)}px`,
  dur: `${f2(5 + rnd(i, 3) * 5)}s`,
  delay: `${f2(rnd(i, 4) * -8)}s`,
  drift: `${f2((rnd(i, 5) - 0.5) * 80)}px`,
}));

function Mandala() {
  const petals = (n: number, r: number, rx: number, ry: number) =>
    Array.from({ length: n }, (_, i) => (
      <ellipse key={i} cx="0" cy={-r} rx={rx} ry={ry} transform={`rotate(${(360 / n) * i})`} />
    ));
  return (
    <svg viewBox="-200 -200 400 400" className="h-full w-full" aria-hidden>
      <g fill="none" stroke="#fdb174" strokeWidth="0.7">
        <g className="mandala-cw" strokeOpacity="0.55">
          <circle r="190" strokeDasharray="2 6" />
          {petals(36, 165, 7, 22)}
          <circle r="140" />
        </g>
        <g className="mandala-ccw" strokeOpacity="0.45">
          {petals(24, 118, 12, 30)}
          <circle r="92" strokeDasharray="1 4" />
          {petals(12, 70, 14, 28)}
        </g>
        <g className="mandala-cw-slow" strokeOpacity="0.35">
          {Array.from({ length: 48 }, (_, i) => (
            <line key={i} x1="0" y1="-150" x2="0" y2="-160" transform={`rotate(${7.5 * i})`} />
          ))}
        </g>
      </g>
    </svg>
  );
}

function Lotus() {
  // 9 petals fanning out from the base
  const angles = [-72, -54, -36, -18, 0, 18, 36, 54, 72];
  return (
    <svg viewBox="-120 -110 240 120" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="petal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f26b1d" />
          <stop offset="0.55" stopColor="#fdb174" />
          <stop offset="1" stopColor="#fff6ed" />
        </linearGradient>
      </defs>
      {angles.map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path
            className="lotus-petal"
            style={{ animationDelay: `${f2(2.2 + Math.abs(a) / 120)}s`, opacity: f2(0.6 + (1 - Math.abs(a) / 90) * 0.4) }}
            d="M0 0 C -22 -30 -18 -70 0 -100 C 18 -70 22 -30 0 0 Z"
            fill="url(#petal)"
            stroke="#fff6ed"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * Animated 3D intro shown once per browser session.
 * Skippable (button, Esc / Enter / Space). Respects "reduce motion".
 */
export function IntroSplash({ title = APP_NAME }: { title?: string }) {
  const [state, setState] = useState<"show" | "leaving" | "gone">("show");

  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    setState((s) => (s === "show" ? "leaving" : s));
  }, []);

  useEffect(() => {
    if (document.documentElement.classList.contains("no-splash")) {
      setState("gone");
      return;
    }
    document.body.style.overflow = "hidden";
    const t = setTimeout(finish, DURATION);
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", "Enter", " "].includes(e.key)) finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  useEffect(() => {
    if (state === "leaving") {
      document.body.style.overflow = "";
      const t = setTimeout(() => setState("gone"), 900);
      return () => clearTimeout(t);
    }
    if (state === "gone") document.body.style.overflow = "";
  }, [state]);

  if (state === "gone") return null;

  return (
    <div
      id="intro-splash"
      className={state === "leaving" ? "is-leaving" : ""}
      role="dialog"
      aria-modal="true"
      aria-label={`${MANIMA_NAME} presents ${title}`}
      style={{ ["--intro-duration" as string]: `${DURATION}ms` }}
    >
      {/* Divine light rays */}
      <div className="intro-rays" aria-hidden />
      {/* Dawn glow */}
      <div className="intro-dawn" aria-hidden />

      {/* Rising sparks, like diya flames */}
      <div className="intro-sparks" aria-hidden>
        {SPARKS.map((s, i) => (
          <span
            key={i}
            style={{
              left: s.left,
              width: s.size,
              height: s.size,
              animationDuration: s.dur,
              animationDelay: s.delay,
              ["--drift" as string]: s.drift,
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={finish}
        className="absolute right-4 top-4 z-20 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur transition hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30 sm:right-6 sm:top-6"
      >
        Skip intro ›
      </button>

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center px-5 text-center">
        {/* 3D stage */}
        <div className="intro-stage relative flex w-[min(82vw,440px)] items-center justify-center">
          <div className="intro-mandala absolute left-1/2 top-1/2 w-[150%] -translate-x-1/2 -translate-y-1/2" style={{ aspectRatio: "1" }}>
            <Mandala />
          </div>
          <div className="intro-halo absolute left-1/2 top-1/2 h-[95%] w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-full" aria-hidden />

          <div className="intro-emblem-entry relative w-full">
            <div className="intro-emblem-float relative w-full" style={{ aspectRatio: "900 / 633" }}>
              {Array.from({ length: DEPTH_LAYERS }, (_, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={MANIMA_LOGO_DEPTH}
                  alt=""
                  aria-hidden
                  className="intro-layer absolute inset-0 h-full w-full object-contain"
                  style={{ transform: `translateZ(${f2(-(i + 1) * 1.6)}px)`, opacity: f2(1 - i * 0.06) }}
                />
              ))}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MANIMA_LOGO_LIGHT} alt={`${MANIMA_NAME} logo`} className="intro-face absolute inset-0 h-full w-full object-contain" />
              <div className="intro-sheen absolute inset-0" style={{ WebkitMaskImage: `url(${MANIMA_LOGO_LIGHT})`, maskImage: `url(${MANIMA_LOGO_LIGHT})` }} aria-hidden />
            </div>
          </div>

          <div className="absolute -bottom-[18%] left-1/2 h-[34%] w-[62%] -translate-x-1/2" style={{ zIndex: -1 }}>
            <Lotus />
          </div>
        </div>

        <p className="intro-in mt-12 text-[11px] font-semibold uppercase tracking-[0.42em] text-brand-200/80 sm:mt-14" style={{ animationDelay: "2.7s" }}>
          ॐ &nbsp;Hare Krishna&nbsp; ॐ
        </p>
        <h2 className="intro-brand mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.12em] sm:text-4xl" aria-label={MANIMA_NAME}>
          {MANIMA_NAME.split(" ").map((w, wi) => (
            <span key={wi} className="inline-block whitespace-nowrap">
              {[...w].map((ch, i) => (
                <span key={i} className="intro-letter3d" style={{ animationDelay: `${f2(3.0 + (wi * 6 + i) * 0.04)}s` }} aria-hidden>
                  {ch}
                </span>
              ))}
              {wi < 2 && <span aria-hidden>&nbsp;</span>}
            </span>
          ))}
        </h2>
        <p className="intro-in mt-1 text-xs text-blue-200/70" style={{ animationDelay: "3.8s" }}>
          {MANIMA_SITE} &nbsp;·&nbsp; <span className="italic">presents</span>
        </p>

        <div className="intro-rule mt-5 flex items-center gap-3" aria-hidden>
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-brand-300/80 sm:w-24" />
          <span className="text-brand-300">✦</span>
          <span className="h-px w-16 bg-gradient-to-l from-transparent to-brand-300/80 sm:w-24" />
        </div>

        <div className="intro-in mt-4 flex items-center gap-3 text-left" style={{ animationDelay: "4.5s" }}>
          <span className="intro-portrait inline-flex h-14 w-14 shrink-0 rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 p-[2px] sm:h-16 sm:w-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PRABHUPADA_IMG} alt="Srila Prabhupada" className="h-full w-full rounded-full object-cover ring-2 ring-white/80" />
          </span>
          <span>
            <span className="block font-display text-xl font-bold text-white sm:text-2xl">{title}</span>
            <span className="block text-sm text-brand-200/90">{APP_TAGLINE}</span>
          </span>
        </div>
        <p className="intro-in mt-2 text-sm text-blue-100/70" style={{ animationDelay: "4.9s" }}>
          Book distribution · Daily sales · Collected money — made simple
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/10" aria-hidden>
        <div className="intro-progress h-full bg-gradient-to-r from-brand-400 via-brand-300 to-blue-300" />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small "?" that explains an unfamiliar term.
 * Tap to open on phones, hover/focus on desktop. The bubble is only rendered while open
 * and is nudged to stay fully inside the screen, so it never causes sideways scrolling.
 */
export function HelpTip({ children, label = "What does this mean?" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !bubble.current) return;
    setShift(0);
    const r = bubble.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const pad = 12;
    if (r.left < pad) setShift(pad - r.left);
    else if (r.right > vw - pad) setShift(vw - pad - r.right);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className="relative inline-flex align-middle"
      onMouseEnter={(e) => e.nativeEvent instanceof MouseEvent && matchMedia("(hover: hover)").matches && setOpen(true)}
      onMouseLeave={() => matchMedia("(hover: hover)").matches && setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="-my-2 ml-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold text-ink-700 focus:outline-none"
      >
        <span className={`flex h-5 w-5 items-center justify-center rounded-full transition ${open ? "bg-brand-500 text-white" : "bg-stone-200 hover:bg-brand-200"}`}>?</span>
      </button>
      {open && (
        <span
          ref={bubble}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className="absolute bottom-full left-1/2 z-40 mb-1.5 w-64 max-w-[calc(100vw-24px)] rounded-xl bg-ink-900 px-3 py-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-xl"
        >
          {children}
        </span>
      )}
    </span>
  );
}

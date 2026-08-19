"use client";
import { useEffect, type RefObject } from "react";

/** Focus management for a modal dialog.
 *
 *  role="alertdialog" aria-modal="true" is a promise: focus moves inside, Tab
 *  stays inside, and focus returns where it came from on close. Both dialogs in
 *  the shell made the promise and kept none of it — a screen reader announced
 *  nothing because focus never left the page behind the overlay, and Tab walked
 *  straight into the controls underneath it.
 *
 *  (The mobile drawer keeps its own copy: it also owns Escape, aria-controls and
 *  a specific trigger to restore to.)
 */
export function useFocusTrap(active: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusables = () => Array.from(
      panel?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])') || []);

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);

    // the page behind a modal must not scroll under it
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnTo?.focus();
    };
  }, [active, ref]);
}

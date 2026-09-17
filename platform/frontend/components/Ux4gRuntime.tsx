"use client";
import { useEffect } from "react";

/**
 * Boots the UX4G interactive runtime once on the client.
 *
 * The package's runtime injects the vendor JS that drives event-delegated
 * behaviours (dropdown, modal, tooltip, popover, accordion, tab, carousel,
 * drawer, toast, scrollspy) and installs a MutationObserver so components added
 * later — e.g. by client navigation — initialise themselves. initRuntime() is
 * SSR-safe (no-ops without window) and singleton-guarded, so mounting this once
 * at the root layout is enough for the whole app.
 *
 * Most of this app's widgets are hand-rolled in React and don't need the
 * runtime, but wiring it in now means any UX4G component we adopt during the
 * migration (tabs, accordion, tooltip) works without per-page setup.
 */
export default function Ux4gRuntime() {
  useEffect(() => {
    let cancelled = false;
    // Import from the "/runtime" subpath: it exposes initRuntime as a proper
    // named export with correct types. The "/design-system" alias ships an
    // empty type declaration (export {}), so TS can't see initRuntime there.
    import("ux4g-web-components/runtime")
      .then((m) => {
        if (!cancelled) m.initRuntime();
      })
      .catch(() => {
        /* runtime is progressive enhancement — a load failure must not break the page */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

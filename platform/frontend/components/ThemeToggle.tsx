"use client";
import { useEffect, useState } from "react";

export const THEME_KEY = "govux-theme";
type Theme = "light" | "dark";

/** Light/dark control.
 *
 *  The choice is the browser's, not the account's: it belongs to the device you
 *  are reading on — a projector in a review meeting wants light even when the
 *  laptop is set dark — and keeping it out of the database means it also works
 *  on the landing page and the sign-in screen, where there is no account yet.
 *
 *  The applied theme is set before first paint by an inline script in the root
 *  layout; this component only flips it afterwards.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    setTheme((el.getAttribute("data-bs-theme") as Theme) || "light");
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-bs-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    setTheme(next);
  }

  // Rendered inert until mounted: the server cannot know the stored choice, and
  // guessing produces a button whose label contradicts the screen for a frame.
  return (
    <button type="button" onClick={toggle} className={`gx-icon-btn ${className}`}
      aria-label={ready ? `Switch to ${theme === "dark" ? "light" : "dark"} theme` : "Switch theme"}
      title={ready ? `Switch to ${theme === "dark" ? "light" : "dark"} theme` : undefined}>
      <i className={`bi ${theme === "dark" ? "bi-sun" : "bi-moon-stars"}`} aria-hidden="true" />
    </button>
  );
}
